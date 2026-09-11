import type { OptimizationLocks, OptimizationPhase, RankedOptimizationEntry } from '../simulation/optimizer';
import type { AggregateResult, SimulationConfig } from '../simulation/types';

export const WORKER_PROTOCOL_VERSION = 1 as const;

export interface SimulationResult extends AggregateResult {
  version: typeof WORKER_PROTOCOL_VERSION;
  requestedTrials: number;
  activeFiveCostIds?: readonly string[];
}

export interface OptimizationResult {
  version: typeof WORKER_PROTOCOL_VERSION;
  requestedTrials: number;
  coarseTrials: number;
  candidateCount: number;
  confirmationCount: number;
  finalistCount: number;
  reliabilityWarning: boolean;
  rankings: RankedOptimizationEntry[];
}

export type WorkerRequest =
  | {
      type: 'run';
      requestId: string;
      config: SimulationConfig;
    }
  | {
      type: 'optimize';
      requestId: string;
      config: SimulationConfig;
      locks: OptimizationLocks;
    }
  | {
      type: 'cancel';
      requestId: string;
    };

export type WorkerResponse =
  | {
      type: 'progress';
      requestId: string;
      completed: number;
      total: number;
    }
  | {
      type: 'complete';
      requestId: string;
      result: SimulationResult;
    }
  | {
      type: 'optimization-progress';
      requestId: string;
      phase: OptimizationPhase;
      completedTrials: number;
      totalTrials: number;
      completedConfigurations: number;
      totalConfigurations: number;
    }
  | {
      type: 'optimization-complete';
      requestId: string;
      result: OptimizationResult;
    }
  | {
      type: 'cancelled';
      requestId: string;
      completed: number;
    }
  | {
      type: 'error';
      requestId: string;
      message: string;
    };
