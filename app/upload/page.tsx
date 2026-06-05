import { UploadZone } from '@/components/UploadZone';

export const metadata = {
  title: 'Upload — FinSight',
};

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Upload Transcript</h1>
        <p className="text-sm text-gray-500">
          Upload an earnings call PDF or paste the transcript. FinSight extracts guidance,
          indexes the text for search, and updates the management credibility score.
        </p>
      </div>
      <UploadZone />
    </div>
  );
}
