from collections.abc import Iterator
from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.response import StreamingBody

from app.core.config import settings


class ObjectStorage:
    def __init__(self) -> None:
        self.client: BaseClient = boto3.client(
            "s3",
            endpoint_url=settings.minio_endpoint,
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
            region_name="us-east-1",
            config=Config(signature_version="s3v4"),
        )

    def upload(self, key: str, stream: BinaryIO, mime_type: str, sha256: str) -> None:
        stream.seek(0)
        self.client.upload_fileobj(
            stream,
            settings.minio_bucket,
            key,
            ExtraArgs={
                "ContentType": mime_type,
                "Metadata": {"sha256": sha256},
            },
        )

    def open(self, key: str) -> StreamingBody:
        response = self.client.get_object(Bucket=settings.minio_bucket, Key=key)
        return response["Body"]

    def copy(self, source_key: str, destination_key: str) -> None:
        self.client.copy_object(
            Bucket=settings.minio_bucket,
            Key=destination_key,
            CopySource={"Bucket": settings.minio_bucket, "Key": source_key},
            MetadataDirective="COPY",
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=settings.minio_bucket, Key=key)


def iter_object(body: StreamingBody) -> Iterator[bytes]:
    try:
        yield from body.iter_chunks(chunk_size=1024 * 1024)
    finally:
        body.close()


@lru_cache
def get_storage() -> ObjectStorage:
    return ObjectStorage()
