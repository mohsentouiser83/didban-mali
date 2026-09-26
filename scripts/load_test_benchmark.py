#!/usr/bin/env python3
"""Didban Mali - Production Load Testing & Latency Benchmark Script

Executes concurrent asynchronous requests to evaluate p50, p95, and p99 latencies,
throughput, and error rates against production endpoints.
"""

import asyncio
import os
import sys
import time
from typing import Any
import httpx

API_BASE_URL = os.getenv("BENCHMARK_API_URL", "http://localhost:8000/api/v1")
CONCURRENCY = int(os.getenv("BENCHMARK_CONCURRENCY", "20"))
REQUESTS_PER_WORKER = int(os.getenv("BENCHMARK_REQUESTS_PER_WORKER", "25"))
TARGET_ENDPOINTS = [
    ("/health/live", "GET", None),
    ("/health/ready", "GET", None),
    ("/health/metrics", "GET", None),
]


async def worker(
    client: httpx.AsyncClient,
    worker_id: int,
    results: list[float],
    status_counts: dict[int, int],
) -> None:
    for i in range(REQUESTS_PER_WORKER):
        endpoint, method, payload = TARGET_ENDPOINTS[i % len(TARGET_ENDPOINTS)]
        url = f"{API_BASE_URL}{endpoint}"
        t0 = time.monotonic()
        try:
            res = await client.get(url, timeout=10.0)
            latency_ms = (time.monotonic() - t0) * 1000.0
            results.append(latency_ms)
            status_counts[res.status_code] = status_counts.get(res.status_code, 0) + 1
        except Exception as exc:
            latency_ms = (time.monotonic() - t0) * 1000.0
            results.append(latency_ms)
            status_counts[599] = status_counts.get(599, 0) + 1


async def run_benchmark() -> int:
    print("=" * 60)
    print(" Didban Mali Production Performance & Concurrency Benchmark")
    print(f" Target API:             {API_BASE_URL}")
    print(f" Concurrency (Workers):  {CONCURRENCY}")
    print(f" Requests Per Worker:    {REQUESTS_PER_WORKER}")
    print(f" Total Target Requests:  {CONCURRENCY * REQUESTS_PER_WORKER}")
    print("=" * 60)

    limits = httpx.Limits(max_keepalive_connections=CONCURRENCY, max_connections=CONCURRENCY * 2)
    results: list[float] = []
    status_counts: dict[int, int] = {}

    start_time = time.monotonic()
    async with httpx.AsyncClient(limits=limits) as client:
        tasks = [
            asyncio.create_task(worker(client, wid, results, status_counts))
            for wid in range(CONCURRENCY)
        ]
        await asyncio.gather(*tasks)
    total_duration = time.monotonic() - start_time

    results.sort()
    total_reqs = len(results)
    if total_reqs == 0:
        print("Error: No requests completed!")
        return 1

    p50 = results[int(total_reqs * 0.50)]
    p95 = results[int(total_reqs * 0.95)]
    p99 = results[int(total_reqs * 0.99)]
    mean_lat = sum(results) / total_reqs
    rps = total_reqs / total_duration

    print("\n" + "=" * 60)
    print(" Benchmark Results Summary")
    print("=" * 60)
    print(f" Total Completed:   {total_reqs} requests in {total_duration:.2f}s")
    print(f" Throughput:        {rps:.1f} req/s")
    print(f" Min Latency:       {results[0]:.2f} ms")
    print(f" Mean Latency:      {mean_lat:.2f} ms")
    print(f" p50 Latency:       {p50:.2f} ms")
    print(f" p95 Latency:       {p95:.2f} ms")
    print(f" p99 Latency:       {p99:.2f} ms")
    print(f" Max Latency:       {results[-1]:.2f} ms")
    print(" Status Codes:      " + ", ".join(f"{code}: {count}" for code, count in sorted(status_counts.items())))

    # Invariant validations (Gate D)
    errors_5xx = sum(count for code, count in status_counts.items() if code >= 500)
    if errors_5xx > 0:
        print(f"\n[FAIL] Gate D: Encountered {errors_5xx} 5xx server errors.")
        return 1

    if p95 > 500.0:
        print(f"\n[FAIL] Gate D: p95 latency {p95:.2f}ms exceeds 500ms threshold.")
        return 1

    print("\n[PASS] Gate D: All performance, concurrency, and latency thresholds passed!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run_benchmark()))
