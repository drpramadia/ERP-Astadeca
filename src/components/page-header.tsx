import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-5 border-b border-line/90 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? (
          <div className="mb-2 flex items-center gap-2.5"><span className="h-[3px] w-6 rounded-full bg-accent" /><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p></div>
        ) : null}
        <h1 className="font-display text-[30px] font-semibold leading-tight text-ink sm:text-[34px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
