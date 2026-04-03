export type SyncAction = "create" | "update" | "skip" | "error";

export interface SyncResult {
  psId: number;
  action: SyncAction;
  shopifyGid?: string;
  error?: string;
}

export interface SyncJobConfig {
  resourceType: string;
  psIds?: number[];
  batchSize?: number;
  dryRun?: boolean;
}

export interface SyncJobStatus {
  jobId: string;
  resourceType: string;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: SyncResult[];
}
