/// <reference lib="webworker" />

import { gameData } from '../data/game-data.generated';
import { aggregateResults } from '../simulation/aggregate';
import { OptimizationCancelledError, runOptimization } from '../simulation/optimizer';
import { activePiecesForConfig, simulateTrial } from '../simulation/simulate-trial';
import type { TrialResult } from '../simulation/types';
import { WORKER_PROTOCOL_VERSION, type OptimizationResult, type SimulationResult, type WorkerRequest, type WorkerResponse } from './protocol';

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const BATCH_SIZE = 500;
const cancelledRequests = new Set<string>();
let activeRequestId: string | null = null;

function post(message: WorkerResponse) {
  context.postMessage(message);
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function runSimulation(requestId: string, config: Extract<WorkerRequest, { type: 'run' }>['config']) {
  activeRequestId = requestId;
  cancelledRequests.delete(requestId);
  const results: TrialResult[] = [];
  let lastProgressAt = 0;

  try {
    for (let start = 0; start < config.trials; start += BATCH_SIZE) {
      if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
        post({ type: 'cancelled', requestId, completed: results.length });
        return;
      }

      const end = Math.min(config.trials, start + BATCH_SIZE);
      for (let trialIndex = start; trialIndex < end; trialIndex += 1) {
        results.push(simulateTrial(config, trialIndex));
      }

      const now = performance.now();
      if (now - lastProgressAt >= 50 || end === config.trials) {
        post({ type: 'progress', requestId, completed: end, total: config.trials });
        lastProgressAt = now;
      }
      await yieldToEventLoop();
    }

    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      post({ type: 'cancelled', requestId, completed: results.length });
      return;
    }

    const aggregate = aggregateResults(results, config.level);
    const result: SimulationResult = {
      version: WORKER_PROTOCOL_VERSION,
      requestedTrials: config.trials,
      ...aggregate,
      activeFiveCostIds: activePiecesForConfig(config).filter((piece) => piece.cost === 5).map((piece) => piece.id),
    };
    post({ type: 'complete', requestId, result });
  } catch (error) {
    post({ type: 'error', requestId, message: error instanceof Error ? error.message : '未知模拟错误' });
  } finally {
    cancelledRequests.delete(requestId);
    if (activeRequestId === requestId) activeRequestId = null;
  }
}

async function runOptimizationRequest(
  requestId: string,
  config: Extract<WorkerRequest, { type: 'optimize' }>['config'],
  locks: Extract<WorkerRequest, { type: 'optimize' }>['locks'],
) {
  activeRequestId = requestId;
  cancelledRequests.delete(requestId);

  try {
    const pieces = activePiecesForConfig(config);
    const synergies = gameData.synergies.map((synergy) => ({
      id: synergy.id,
      pieceIds: pieces.filter((piece) => piece.synergies.includes(synergy.id)).map((piece) => piece.id),
    }));
    const optimized = await runOptimization(config, pieces, synergies, {
      simulate: simulateTrial,
      aggregate: aggregateResults,
      isCancelled: () => cancelledRequests.has(requestId) || activeRequestId !== requestId,
      onProgress: (progress) => post({ type: 'optimization-progress', requestId, ...progress }),
      yieldControl: yieldToEventLoop,
      batchSize: BATCH_SIZE,
    }, locks);
    const result: OptimizationResult = { version: WORKER_PROTOCOL_VERSION, ...optimized };
    post({ type: 'optimization-complete', requestId, result });
  } catch (error) {
    if (error instanceof OptimizationCancelledError) {
      post({ type: 'cancelled', requestId, completed: 0 });
    } else {
      post({ type: 'error', requestId, message: error instanceof Error ? error.message : '未知优化错误' });
    }
  } finally {
    cancelledRequests.delete(requestId);
    if (activeRequestId === requestId) activeRequestId = null;
  }
}

context.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId);
    return;
  }

  if (activeRequestId && activeRequestId !== message.requestId) {
    cancelledRequests.add(activeRequestId);
  }
  if (message.type === 'optimize') {
    void runOptimizationRequest(message.requestId, message.config, message.locks);
  } else {
    void runSimulation(message.requestId, message.config);
  }
});

export {};
