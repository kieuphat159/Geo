/** Shared Tailwind classes for readable form controls on light surfaces (matches `.geo-form-control` in global.css). */
export const formControlClassName = "geo-form-control";

/** Input/select in admin modals and dashboards */
export const formControlFieldClassName =
    "geo-form-control w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

export const formControlFieldClassNameMt1 = `mt-1 ${formControlFieldClassName}`;

export const btnPrimaryClass =
    "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400";

export const btnSecondaryClass =
    "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50";

export const btnDangerClass =
    "rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:bg-red-300";

export const authFieldClass = `mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm ${formControlClassName}`;
