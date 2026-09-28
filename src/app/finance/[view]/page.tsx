import { notFound } from "next/navigation";
import { FinanceClient } from "../finance-client";

const financeViews = ["receivables", "payables", "payments"] as const;

export default async function FinanceViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!financeViews.includes(view as (typeof financeViews)[number])) notFound();
  return <FinanceClient view={view as (typeof financeViews)[number]} />;
}