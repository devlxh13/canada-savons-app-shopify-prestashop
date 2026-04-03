import { JobTracker } from "@/components/sync/job-tracker";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Sync Job</h1>
      <p className="text-sm text-muted-foreground mb-6 font-mono">{jobId}</p>
      <JobTracker jobId={jobId} />
    </div>
  );
}
