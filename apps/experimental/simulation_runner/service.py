import asyncio
import logging
from typing import List, Optional

# Updated imports from your new db module and scenario_types
from apps.experimental.simulation_runner.db import (
    get_pending_run,
    get_simulations_for_run,
    set_run_to_completed,
    get_api_key,
    mark_stale_jobs_as_failed,
    update_run_heartbeat,
    get_db,
    get_collection
)
from apps.experimental.simulation_runner.scenario_types import TestRun, TestSimulation
# If you have a new simulation function, import it here.
# Otherwise, adapt the name as needed:
from apps.experimental.simulation_runner.simulation import simulate_simulations  # or simulate_scenarios, if unchanged

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class JobService:
    def __init__(self):
        self.poll_interval = 5  # seconds
        # Control concurrency of run processing
        self.semaphore = asyncio.Semaphore(5)

    async def poll_and_process_jobs(self, max_iterations_pre_m: Optional[int] = None, max_iterations: int = 2, target_run_id: Optional[str] = None):
        """
        Periodically checks for new runs in MongoDB and processes them.
        """
        logging.info("Starting job polling service...")
        
        # Проверяем подключение к базе данных
        try:
            db = get_db()
            logging.info(f"Successfully connected to MongoDB: {db.name}")
        except Exception as e:
            logging.error(f"Failed to connect to MongoDB: {e}")
            return

        # Start the stale-run check in the background
        asyncio.create_task(self.fail_stale_runs_loop())

        iterations = 0
        consecutive_empty_checks = 0  # Счетчик пустых проверок подряд
        
        while True:
            logging.info(f"Checking for pending runs... (iteration {iterations + 1})")
            
            # Если указан конкретный run_id, ищем только его
            if target_run_id:
                runs_collection = get_collection("test_runs")
                from bson import ObjectId
                run_doc = runs_collection.find_one({"_id": ObjectId(target_run_id)})
                if run_doc and run_doc.get("status") == "pending":
                    from apps.experimental.simulation_runner.scenario_types import TestRun
                    run = TestRun(**{
                        "id": str(run_doc["_id"]),
                        "projectId": run_doc["projectId"],
                        "name": run_doc["name"],
                        "simulationIds": run_doc["simulationIds"],
                        "workflowId": run_doc["workflowId"],
                        "status": run_doc["status"],
                        "startedAt": run_doc["startedAt"],
                        "completedAt": run_doc.get("completedAt"),
                        "aggregateResults": run_doc.get("aggregateResults"),
                        "lastHeartbeat": run_doc.get("lastHeartbeat")
                    })
                    logging.info(f"Found target run: {run}. Processing...")
                    await self.process_run(run, max_iterations)
                    logging.info("Target run processed. Stopping service.")
                    break
                else:
                    logging.info(f"Target run {target_run_id} not found or not pending. Stopping.")
                    break
            else:
                # Обычная логика поиска любых pending runs
                run = get_pending_run()  # <--- changed to match new DB function
                if run:
                    logging.info(f"Found new run: {run}. Processing...")
                    await self.process_run(run, max_iterations)
                    consecutive_empty_checks = 0  # Сбрасываем счетчик
                else:
                    logging.info("No pending runs found. Waiting...")
                    consecutive_empty_checks += 1
                    
                    # Если нет pending runs, проверяем есть ли running runs
                    if consecutive_empty_checks >= 2:  # После 2 пустых проверок
                        runs_collection = get_collection("test_runs")
                        running_runs = runs_collection.count_documents({"status": "running"})
                        
                        if running_runs == 0:
                            logging.info("No pending or running runs found. Stopping service.")
                            break

            iterations += 1
            if max_iterations_pre_m is not None and iterations >= max_iterations_pre_m:
                logging.info(f"Reached max iterations ({max_iterations_pre_m}). Stopping.")
                break

            # Sleep for the polling interval
            await asyncio.sleep(self.poll_interval)

    async def process_run(self, run: TestRun, max_iterations: int):
        """
        Calls the simulation function and updates run status upon completion.
        """
        async with self.semaphore:
            # Start heartbeat in background
            stop_heartbeat_event = asyncio.Event()
            heartbeat_task = asyncio.create_task(self.heartbeat_loop(run.id, stop_heartbeat_event))

            try:
                # Fetch the simulations associated with this run
                simulations = get_simulations_for_run(run)
                if not simulations:
                    logging.info(f"No simulations found for run {run.id}")
                    return

                # Fetch API key if needed
                api_key = get_api_key(run.projectId)

                # Perform your simulation logic
                # adapt this call to your actual simulation function's signature
                aggregate_result = await simulate_simulations(
                    simulations=simulations,
                    run_id=run.id,
                    workflow_id=run.workflowId,
                    api_key=api_key,
                    max_iterations=max_iterations  # Ограничиваем диалог 2 итерациями
                )

                # Mark run as completed with the aggregated result
                set_run_to_completed(run, aggregate_result)
                logging.info(f"Run {run.id} completed.")
            except Exception as exc:
                logging.error(f"Run {run.id} failed: {exc}")
            finally:
                stop_heartbeat_event.set()
                await heartbeat_task

    async def fail_stale_runs_loop(self):
        """
        Periodically checks for stale runs (no heartbeat) and marks them as 'failed'.
        """
        while True:
            count = mark_stale_jobs_as_failed()
            if count > 0:
                logging.warning(f"Marked {count} stale runs as failed.")
            await asyncio.sleep(60)  # Check every 60 seconds

    async def heartbeat_loop(self, run_id: str, stop_event: asyncio.Event):
        """
        Periodically updates 'lastHeartbeat' for the given run until 'stop_event' is set.
        """
        try:
            while not stop_event.is_set():
                update_run_heartbeat(run_id)
                await asyncio.sleep(10)  # Heartbeat interval in seconds
        except asyncio.CancelledError:
            pass

    def start(self):
        """
        Entry point to start the service event loop.
        """
        loop = asyncio.get_event_loop()
        try:
            loop.run_until_complete(self.poll_and_process_jobs())
        except KeyboardInterrupt:
            logging.info("Service stopped by user.")
        finally:
            loop.close()


if __name__ == "__main__":
    service = JobService()
    service.start()
