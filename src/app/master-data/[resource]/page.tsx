import { MasterDataClient } from "./master-data-client";

export default async function MasterDataPage({
  params,
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource } = await params;
  return <MasterDataClient resource={resource} />;
}