"""Durable DB outbox consumer; restart safely resumes unacknowledged leases."""

from __future__ import annotations
import argparse
import logging
import signal
import threading

from .application.analysis_worker import AnalysisWorker
from .application.model_worker import ModelWorker
from .application.input_review_worker import InputReviewWorker
from .application.actionable_maintenance_worker import ActionableMaintenanceWorker
from .application.financial_worker import FinancialWorker
from .application.interpretation_worker import InterpretationWorker
from .application.preparation_worker import PreparationWorker, WorkerSettings
from .application.report_worker import ReportWorker
from .application.source_cleanup_worker import SourceCleanupWorker


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    stop = threading.Event()
    for event in (signal.SIGTERM, signal.SIGINT):
        signal.signal(event, lambda *_: stop.set())
    logging.basicConfig(level=logging.INFO)
    worker = PreparationWorker(WorkerSettings.from_env())
    interpreter = InterpretationWorker(WorkerSettings.from_env())
    financial = FinancialWorker(WorkerSettings.from_env())
    analysis = AnalysisWorker(WorkerSettings.from_env())
    reports = ReportWorker(WorkerSettings.from_env())
    source_cleanup = SourceCleanupWorker(WorkerSettings.from_env())
    model = ModelWorker(WorkerSettings.from_env())
    review = InputReviewWorker(WorkerSettings.from_env())
    actionable_maintenance = ActionableMaintenanceWorker(WorkerSettings.from_env())
    while not stop.is_set():
        try:
            worked = worker.run_once()
            if not worked:
                worked = interpreter.run_once()
            if not worked:
                worked = financial.run_once()
            if not worked:
                worked = analysis.run_once()
            if not worked:
                worked = reports.run_once()
            if not worked:
                worked = source_cleanup.run_once()
            if not worked:
                worked = model.run_once()
            if not worked:
                worked = review.run_once()
            if not worked:
                worked = actionable_maintenance.run_once()
        except Exception as error:
            logging.error("worker_dependency_failure type=%s", type(error).__name__)
            worked = False
        if args.once:
            return
        if not worked:
            stop.wait(1)


if __name__ == "__main__":
    main()
