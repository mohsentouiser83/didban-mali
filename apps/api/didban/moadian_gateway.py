"""Direct Moadian v2 transport (INTA RC_TICS.IS_v1.4, sections 5–8)."""

import base64
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from os import urandom
from typing import Literal

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature, UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_BASE_URL = "https://tp.tax.gov.ir/requestsmanager/api/v2/"
_UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")
_TAX_ID = re.compile(r"[A-Z0-9]{6}[A-F0-9]{15}[0-9]")
_MAX_RESPONSE_BYTES = 262_144
ResultStatus = Literal["queued", "accepted", "rejected", "unknown"]
_STATE: dict[str, ResultStatus] = {
    "SUCCESS": "accepted",
    "FAILED": "rejected",
    "IN_PROGRESS": "queued",
    "NOT_FOUND": "unknown",
    "TIMEOUT": "unknown",
}


@dataclass(frozen=True)
class MoadianCredentials:
    memory_id: str
    private_key_pem: bytes = field(repr=False)
    certificate_pem: bytes = field(repr=False)


@dataclass(frozen=True)
class MoadianResult:
    status: ResultStatus
    reference_number: str | None = None
    error_codes: tuple[str, ...] = ()
    evidence_digest: str | None = None


class MoadianGatewayError(Exception):
    def __init__(self, code: str, *, transmission_possible: bool = True):
        super().__init__(code)
        self.code = code
        self.transmission_possible = transmission_possible


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_b64url(value: str) -> bytes:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("invalid base64url")
    return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)


def _json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def _uuid(value: object) -> str | None:
    return value.lower() if isinstance(value, str) and _UUID.fullmatch(value) else None


def _evidence_digest(row: dict) -> str:
    payload = json.dumps(row, separators=(",", ":"), sort_keys=True)
    return sha256(payload.encode()).hexdigest()


def _failure_codes(row: dict) -> tuple[str, ...]:
    data = row.get("data")
    errors = data.get("error") if isinstance(data, dict) else None
    if not isinstance(errors, list):
        return ()
    return tuple(
        dict.fromkeys(
            item["code"]
            for item in errors[:50]
            if isinstance(item, dict)
            and isinstance(item.get("code"), str)
            and re.fullmatch(r"[0-9]{3,8}", item["code"])
        )
    )


class MoadianGateway:
    def __init__(self, credentials: MoadianCredentials, transport: httpx.BaseTransport | None = None):
        self._memory = credentials.memory_id
        self._transport = transport
        try:
            if not re.fullmatch(r"[A-Z0-9]{6}", self._memory):
                raise ValueError("invalid fiscal memory identifier")
            key = serialization.load_pem_private_key(credentials.private_key_pem, password=None)
            certificates = x509.load_pem_x509_certificates(credentials.certificate_pem)
            certificate_key = certificates[0].public_key()
            if (
                not isinstance(key, rsa.RSAPrivateKey)
                or key.key_size < 2048
                or not isinstance(certificate_key, rsa.RSAPublicKey)
                or key.public_key().public_numbers() != certificate_key.public_numbers()
                or not (
                    certificates[0].not_valid_before_utc
                    <= datetime.now(timezone.utc)
                    < certificates[0].not_valid_after_utc
                )
            ):
                raise ValueError("invalid signing credentials")
        except (ValueError, TypeError, IndexError, UnsupportedAlgorithm) as error:
            raise MoadianGatewayError("moadian_credentials_invalid", transmission_possible=False) from error
        self._key = key
        self._chain = [
            base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode("ascii")
            for cert in certificates
        ]

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=_BASE_URL,
            headers={"accept": "application/json"},
            timeout=httpx.Timeout(12, connect=5),
            transport=self._transport,
            follow_redirects=False,
            trust_env=False,
        )

    def _sign(self, payload: object) -> str:
        header = {
            "alg": "RS256",
            "x5c": self._chain,
            "sigT": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "crit": ["sigT"],
        }
        signing_input = _b64url(_json(header)) + "." + _b64url(_json(payload))
        signature = self._key.sign(signing_input.encode("ascii"), padding.PKCS1v15(), hashes.SHA256())
        return signing_input + "." + _b64url(signature)

    @staticmethod
    def _request(
        client: httpx.Client, method: str, path: str, *, transmission_possible: bool = False, **kwargs
    ) -> object:
        try:
            with client.stream(method, path, **kwargs) as response:
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > _MAX_RESPONSE_BYTES:
                        raise ValueError("oversized response")
                return json.loads(content)
        except (httpx.HTTPError, ValueError) as error:
            raise MoadianGatewayError(
                "moadian_upstream_unavailable", transmission_possible=transmission_possible
            ) from error

    def _auth(self, client: httpx.Client) -> dict[str, str]:
        reply = self._request(client, "GET", "nonce", params={"timeToLive": 30})
        nonce = reply.get("nonce") if isinstance(reply, dict) else None
        if not isinstance(nonce, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", nonce):
            raise MoadianGatewayError("moadian_nonce_invalid", transmission_possible=False)
        token = self._sign({"nonce": nonce, "clientId": self._memory})
        return {"authorization": "Bearer " + token}

    def _server_keys(self, client: httpx.Client) -> list[tuple[str, rsa.RSAPublicKey]]:
        reply = self._request(client, "GET", "server-information", headers=self._auth(client))
        keys = reply.get("publicKeys") if isinstance(reply, dict) else None
        parsed = []
        if isinstance(keys, list):
            for entry in keys[:20]:
                if (
                    not isinstance(entry, dict)
                    or entry.get("algorithm") != "RSA"
                    or entry.get("purpose") != 1
                    or not isinstance(entry.get("id"), str)
                    or not 1 <= len(entry["id"]) <= 128
                    or not isinstance(entry.get("key"), str)
                ):
                    continue
                try:
                    public_key = serialization.load_der_public_key(
                        base64.b64decode(entry["key"], validate=True)
                    )
                except (ValueError, TypeError, UnsupportedAlgorithm):
                    continue
                if isinstance(public_key, rsa.RSAPublicKey) and public_key.key_size >= 2048:
                    parsed.append((entry["id"], public_key))
        if not parsed:
            raise MoadianGatewayError("moadian_server_key_missing", transmission_possible=False)
        return parsed

    @staticmethod
    def _encrypt(signed: str, key_id: str, public_key: rsa.RSAPublicKey) -> str:
        protected = _b64url(_json({"alg": "RSA-OAEP-256", "enc": "A256GCM", "kid": key_id}))
        encryption_key, nonce = AESGCM.generate_key(bit_length=256), urandom(12)
        encrypted = AESGCM(encryption_key).encrypt(nonce, signed.encode("ascii"), protected.encode("ascii"))
        wrapped_key = public_key.encrypt(
            encryption_key,
            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
        )
        return ".".join(
            [
                protected,
                _b64url(wrapped_key),
                _b64url(nonce),
                _b64url(encrypted[:-16]),
                _b64url(encrypted[-16:]),
            ]
        )

    def submit(self, uid: str, invoice: dict) -> MoadianResult:
        uid = _uuid(uid)
        if uid is None:
            raise MoadianGatewayError("moadian_uid_invalid", transmission_possible=False)
        with self._client() as client:
            key_id, public_key = self._server_keys(client)[0]
            try:
                payload = self._encrypt(self._sign(invoice), key_id, public_key)
            except (ValueError, TypeError) as error:
                raise MoadianGatewayError(
                    "moadian_invoice_packet_invalid", transmission_possible=False
                ) from error
            reply = self._request(
                client,
                "POST",
                "invoice",
                headers=self._auth(client),
                json=[{"payload": payload, "header": {"requestTraceId": uid, "fiscalId": self._memory}}],
                transmission_possible=True,
            )
        result = reply.get("result") if isinstance(reply, dict) else None
        if not isinstance(result, list) or len(result) != 1 or not isinstance(result[0], dict):
            raise MoadianGatewayError("moadian_receipt_invalid")
        row = result[0]
        reference = _uuid(row.get("referenceNumber"))
        if (
            _uuid(row.get("uid")) != uid
            or reference is None
            or row.get("packetType") is not None
            or row.get("data") is not None
        ):
            raise MoadianGatewayError("moadian_receipt_invalid")
        return MoadianResult("queued", reference, evidence_digest=_evidence_digest(row))

    def inquire(
        self,
        uid: str,
        reference_number: str | None = None,
        *,
        submitted_at: datetime | None = None,
        tax_id: str | None = None,
    ) -> MoadianResult:
        request_uid = _uuid(uid)
        reference = _uuid(reference_number)
        if request_uid is None or (reference_number is not None and reference is None):
            raise MoadianGatewayError("moadian_inquiry_identifier_invalid", transmission_possible=False)
        if reference is not None:
            path, params = "inquiry-by-reference-id", {"referenceIds": reference}
        else:
            path, params = "inquiry-by-uid", {"uidList": request_uid, "fiscalId": self._memory}
        if submitted_at is not None:
            stamp = submitted_at.replace(tzinfo=timezone.utc) if submitted_at.tzinfo is None else submitted_at
            params["start"] = (stamp - timedelta(hours=1)).isoformat(timespec="milliseconds")
            params["end"] = min(stamp + timedelta(days=1), datetime.now(timezone.utc)).isoformat(
                timespec="milliseconds"
            )
        with self._client() as client:
            reply = self._request(client, "GET", path, headers=self._auth(client), params=params)
            if reply == []:
                return MoadianResult("unknown", reference)
            if not isinstance(reply, list) or len(reply) != 1 or not isinstance(reply[0], dict):
                raise MoadianGatewayError("moadian_inquiry_response_invalid")
            row = reply[0]
            upstream = row.get("status")
            status = _STATE.get(upstream) if isinstance(upstream, str) else None
            if upstream == "NOT_FOUND":
                return MoadianResult("unknown", reference)
            observed_reference = _uuid(row.get("referenceNumber"))
            if (
                status is None
                or _uuid(row.get("uid")) != request_uid
                or row.get("fiscalId") != self._memory
                or observed_reference is None
                or (reference is not None and observed_reference != reference)
            ):
                raise MoadianGatewayError("moadian_inquiry_response_invalid")
            if status == "accepted":
                self._verify_acceptance(client, row.get("sign"), observed_reference, tax_id)
        return MoadianResult(status, observed_reference, _failure_codes(row), _evidence_digest(row))

    def _verify_acceptance(
        self, client: httpx.Client, token: object, reference: str, tax_id: str | None
    ) -> None:
        try:
            if not isinstance(token, str) or not 1 <= len(token) <= 8192:
                raise ValueError("invalid acceptance token")
            header_part, payload_part, signature_part = token.split(".")
            header = json.loads(_decode_b64url(header_part))
            payload = json.loads(_decode_b64url(payload_part))
            signature = _decode_b64url(signature_part)
            received_tax_id = payload.get("taxId") if isinstance(payload, dict) else None
            if (
                not isinstance(header, dict)
                or header.get("alg") != "RS256"
                or not isinstance(payload, dict)
                or _uuid(payload.get("referenceNumber")) != reference
                or payload.get("clientId") != self._memory
                or not isinstance(received_tax_id, str)
                or not _TAX_ID.fullmatch(received_tax_id)
                or not received_tax_id.startswith(self._memory)
                or (tax_id is not None and received_tax_id != tax_id)
            ):
                raise ValueError("acceptance token does not match invoice")
        except (ValueError, TypeError) as error:
            raise MoadianGatewayError("moadian_acceptance_invalid") from error
        signed = f"{header_part}.{payload_part}".encode("ascii")
        for _, key in self._server_keys(client):
            try:
                key.verify(signature, signed, padding.PKCS1v15(), hashes.SHA256())
            except InvalidSignature:
                continue
            return
        raise MoadianGatewayError("moadian_acceptance_invalid")
