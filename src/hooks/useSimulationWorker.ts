import { useCallback, useEffect, useRef, useState } from 'react';
import type { OptimizationPhase } from '../simulation/optimizer';
import type { SimulationConfig } from '../simulation/types';
import type { OptimizationResult, SimulationResult, WorkerRequest, WorkerResponse } from '../workers/protocol';

export type WorkerStatus = 'idle' | 'running' | 'cancelled' | 'complete' | 'error';
export type WorkerMode = 'simulation' | 'optimization';

interface SimulationWorkerState {
  status: WorkerStatus;
  mode: WorkerMode | null;
  progress: number;
  completed: number;
  total: number;
  completedConfigurations: number;
  totalConfigurations: number;
  optimizationPhase: OptimizationPhase | null;
  result: SimulationResult | null;
  optimizationResult: OptimizationResult | null;
  error: string | null;
}

const initialState: SimulationWorkerState = {
  status: 'idle',
  mode: null,
  progress: 0,
  completed: 0,
  total: 0,
  completedConfigurations: 0,
  totalConfigurations: 0,
  optimizationPhase: null,
  result: null,
  optimizationResult: null,
  error: null,
};

export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const [state, setState] = useState(initialState);

  const ensureWorker = useCallback(() => {
    if (workerRef.current === null) {
      workerRef.current = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    const worker = ensureWorker();
    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== activeRequestRef.current) return;

      if (message.type === 'progress') {
        setState((current) => ({
          ...current,
          completed: message.completed,
          total: message.total,
          progress: message.total === 0 ? 0 : message.completed / message.total,
        }));
      } else if (message.type === 'complete') {
        setState((current) => ({
          ...current,
          status: 'complete',
          mode: 'simulation',
          progress: 1,
          completed: message.result.completedTrials,
          total: message.result.requestedTrials,
          result: message.result,
          error: null,
        }));
      } else if (message.type === 'optimization-progress') {
        setState((current) => ({
          ...current,
          optimizationPhase: message.phase,
          completed: message.completedTrials,
          total: message.totalTrials,
          progress: message.totalTrials === 0 ? 0 : message.completedTrials / message.totalTrials,
          completedConfigurations: message.completedConfigurations,
          totalConfigurations: message.totalConfigurations,
        }));
      } else if (message.type === 'optimization-complete') {
        setState((current) => ({
          ...current,
          status: 'complete',
          mode: 'optimization',
          progress: 1,
          optimizationResult: message.result,
          error: null,
        }));
      } else if (message.type === 'cancelled') {
        setState((current) => ({ ...current, status: 'cancelled', completed: message.completed }));
      } else {
        setState((current) => ({ ...current, status: 'error', error: message.message }));
      }
    };

    worker.addEventListener('message', handleMessage);
    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, [ensureWorker]);

  const createRequestId = useCallback(() => typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${activeRequestRef.current ?? 'request'}`, []);

  const run = useCallback((config: SimulationConfig) => {
    const requestId = createRequestId();
    activeRequestRef.current = requestId;
    setState({ ...initialState, status: 'running', mode: 'simulation', total: config.trials });
    const message: WorkerRequest = { type: 'run', requestId, config };
    ensureWorker().postMessage(message);
  }, [createRequestId, ensureWorker]);

  const optimize = useCallback((config: SimulationConfig) => {
    const requestId = createRequestId();
    activeRequestRef.current = requestId;
    setState({ ...initialState, status: 'running', mode: 'optimization' });
    const message: WorkerRequest = { type: 'optimize', requestId, config };
    ensureWorker().postMessage(message);
  }, [createRequestId, ensureWorker]);

  const cancel = useCallback(() => {
    const requestId = activeRequestRef.current;
    if (!requestId) return;
    const message: WorkerRequest = { type: 'cancel', requestId };
    ensureWorker().postMessage(message);
  }, [ensureWorker]);

  return { ...state, run, optimize, cancel };
}
