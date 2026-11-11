"""Exercise the direct Moadian wire contract against a synthetic remote peer."""

import base64
import json
from datetime import datetime, timedelta, timezone
from hashlib import sha256

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.x509.oid import NameOID

from didban.moadian_gateway import MoadianCredentials, MoadianGateway, MoadianGatewayError

MEMORY = "A111OK"
UID = "cb080c58-e36f-4bb0-a932-90f672109fb6"
REFERENCE = "f9173085-2316-4ca6-918e-e41aaf7ef8dd"
OTHER_UID = "b3bd6327-1c57-4cae-85ed-5c88de28aea3"
TAX_ID = "A111OK04D36722D396C463"
PREFIX = "/requestsmanager/api/v2/"


def decode(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def credentials():
    signer = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    org = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    identity = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Moadian signatory")])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(identity)
        .issuer_name(identity)
        .public_key(signer.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .sign(signer, hashes.SHA256())
    )
    private_pem = signer.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return (
        MoadianCredentials(MEMORY, private_pem, certificate.public_bytes(serialization.Encoding.PEM)),
        signer,
        org,
    )


def server_information(org):
    public_der = org.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return {
        "serverTime": 1684055518885,
        "publicKeys": [
            {
                "key": base64.b64encode(public_der).decode(),
                "id": "synthetic-key-1",
                "algorithm": "RSA",
                "purpose": 1,
            }
        ],
    }


def read_signed(token: str, signer):
    header, payload, signature = token.split(".")
    signer.public_key().verify(
        decode(signature), f"{header}.{payload}".encode(), padding.PKCS1v15(), hashes.SHA256()
    )
    return json.loads(decode(header)), json.loads(decode(payload))


def signed_acceptance(org, **overrides):
    header = encode(b'{"alg":"RS256","sigT":"2024-02-14T03:08:39Z"}')
    data = {"referenceNumber": REFERENCE, "clientId": MEMORY, "taxId": TAX_ID}
    data.update(overrides)
    payload = encode(json.dumps(data).encode())
    signature = org.sign(f"{header}.{payload}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{header}.{payload}.{encode(signature)}"


def test_submit_encrypts_and_signs_invoice_and_authenticates_each_request(credentials):
    config, signer, org = credentials
    invoice = {"header": {"taxid": TAX_ID}, "body": [{"sstt": "کالای نمونه"}], "payments": []}
    receipt = {"uid": UID, "packetType": None, "referenceNumber": REFERENCE, "data": None}
    routes = []

    def peer(request):
        assert request.url.scheme == "https" and request.url.host == "tp.tax.gov.ir"
        route = request.url.path.removeprefix(PREFIX)
        routes.append(route)
        if route == "nonce":
            return httpx.Response(200, json={"nonce": f"nonce-{len(routes)}"})
        auth_header, auth_payload = read_signed(
            request.headers["authorization"].removeprefix("Bearer "), signer
        )
        assert auth_header["crit"] == ["sigT"]
        assert auth_header["alg"] == "RS256"
        assert auth_payload == {"nonce": f"nonce-{len(routes) - 1}", "clientId": MEMORY}
        certificate = x509.load_der_x509_certificate(base64.b64decode(auth_header["x5c"][0]))
        assert certificate.public_key().public_numbers() == signer.public_key().public_numbers()
        if route == "server-information":
            return httpx.Response(200, json=server_information(org))
        assert route == "invoice" and request.method == "POST"
        (packet,) = json.loads(request.content)
        assert packet["header"] == {"requestTraceId": UID, "fiscalId": MEMORY}
        protected, wrapped, iv, cipher, tag = packet["payload"].split(".")
        assert json.loads(decode(protected)) == {
            "alg": "RSA-OAEP-256",
            "enc": "A256GCM",
            "kid": "synthetic-key-1",
        }
        key = org.decrypt(
            decode(wrapped),
            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
        )
        signed_invoice = AESGCM(key).decrypt(decode(iv), decode(cipher) + decode(tag), protected.encode())
        assert read_signed(signed_invoice.decode(), signer)[1] == invoice
        return httpx.Response(
            200,
            json={
                "timestamp": 1684054900556,
                "result": [receipt],
            },
        )

    result = MoadianGateway(config, httpx.MockTransport(peer)).submit(UID, invoice)
    assert result.status == "queued" and result.reference_number == REFERENCE
    assert (
        result.evidence_digest
        == sha256(json.dumps(receipt, separators=(",", ":"), sort_keys=True).encode()).hexdigest()
    )
    assert routes == ["nonce", "server-information", "nonce", "invoice"]


def test_never_accepts_unmatched_receipt_or_retries_ambiguous_post(credentials):
    config, _, org = credentials

    def peer(request):
        route = request.url.path.removeprefix(PREFIX)
        if route == "nonce":
            return httpx.Response(200, json={"nonce": "challenge"})
        if route == "server-information":
            return httpx.Response(200, json=server_information(org))
        return httpx.Response(200, json={"result": [{"uid": OTHER_UID, "referenceNumber": REFERENCE}]})

    with pytest.raises(MoadianGatewayError) as failure:
        MoadianGateway(config, httpx.MockTransport(peer)).submit(UID, {})
    assert failure.value.code == "moadian_receipt_invalid"
    assert failure.value.transmission_possible

    def offline(request):
        raise httpx.ConnectError("offline", request=request)

    with pytest.raises(MoadianGatewayError) as failure:
        MoadianGateway(config, httpx.MockTransport(offline)).submit(UID, {})
    assert failure.value.code == "moadian_upstream_unavailable"
    assert not failure.value.transmission_possible


def test_inquiry_requires_matching_verified_acceptance(credentials):
    config, _, org = credentials
    token = signed_acceptance(org)
    sent_at = datetime(2025, 3, 15, 12, tzinfo=timezone.utc)

    def peer(request):
        route = request.url.path.removeprefix(PREFIX)
        if route == "nonce":
            return httpx.Response(200, json={"nonce": "challenge"})
        if route == "server-information":
            return httpx.Response(200, json=server_information(org))
        assert route == "inquiry-by-reference-id" and request.method == "GET"
        assert request.url.params["referenceIds"] == REFERENCE
        assert datetime.fromisoformat(request.url.params["start"]) < sent_at
        assert datetime.fromisoformat(request.url.params["end"]) > sent_at
        return httpx.Response(
            200,
            json=[
                {
                    "uid": UID,
                    "fiscalId": MEMORY,
                    "referenceNumber": REFERENCE,
                    "status": "SUCCESS",
                    "sign": token,
                }
            ],
        )

    gateway = MoadianGateway(config, httpx.MockTransport(peer))
    assert gateway.inquire(UID, REFERENCE, submitted_at=sent_at, tax_id=TAX_ID).status == "accepted"
    token = signed_acceptance(org, taxId=TAX_ID[:-1] + "4")
    with pytest.raises(MoadianGatewayError, match="moadian_acceptance_invalid"):
        gateway.inquire(UID, REFERENCE, submitted_at=sent_at, tax_id=TAX_ID)
    token = signed_acceptance(credentials[1])
    with pytest.raises(MoadianGatewayError, match="moadian_acceptance_invalid"):
        gateway.inquire(UID, REFERENCE, submitted_at=sent_at, tax_id=TAX_ID)


def test_uid_inquiry_preserves_unknown_and_reported_rejection(credentials):
    config, _, _ = credentials
    row = {"status": "NOT_FOUND"}

    def peer(request):
        route = request.url.path.removeprefix(PREFIX)
        if route == "nonce":
            return httpx.Response(200, json={"nonce": "challenge"})
        assert route == "inquiry-by-uid"
        assert request.url.params["uidList"] == UID and request.url.params["fiscalId"] == MEMORY
        return httpx.Response(200, json=[row])

    gateway = MoadianGateway(config, httpx.MockTransport(peer))
    assert gateway.inquire(UID).status == "unknown"
    row.update(
        {
            "status": "FAILED",
            "uid": UID,
            "fiscalId": MEMORY,
            "referenceNumber": REFERENCE,
            "data": {"error": [{"code": "011107", "message": "untrusted provider detail"}]},
        }
    )
    result = gateway.inquire(UID)
    assert result.status == "rejected"
    assert result.reference_number == REFERENCE
    assert result.error_codes == ("011107",)
