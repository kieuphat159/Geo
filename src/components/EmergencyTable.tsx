import type { EmergencyCase } from "../types/emergency";

interface EmergencyTableProps {
  rows: EmergencyCase[];
}

const priorityClassMap: Record<EmergencyCase["priority"], string> = {
  CRITICAL: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
  HIGH: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  MEDIUM: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
};

const priorityTextMap: Record<EmergencyCase["priority"], string> = {
  CRITICAL: "Nguy kịch",
  HIGH: "Cao",
  MEDIUM: "Trung bình",
};

const statusTextMap: Record<EmergencyCase["status"], string> = {
  WAITING: "Đang chờ",
  ASSIGNED: "Đã nhận",
  ON_THE_WAY: "Đang di chuyển",
};

export default function EmergencyTable({ rows }: EmergencyTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mb-3 h-10 w-10 text-slate-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
        </svg>
        Chưa có ca cấp cứu nào đang chờ xử lý.
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4 md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="group overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold tracking-tight text-slate-900">{row.id}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClassMap[row.priority]}`}>
                {priorityTextMap[row.priority]}
              </span>
            </div>

            <dl className="space-y-2.5 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt className="text-slate-500">Thời gian:</dt> <dd className="font-medium text-slate-900">{row.createdAt}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-slate-500">Địa chỉ:</dt> 
                <dd className="mt-0.5 font-medium leading-relaxed text-slate-900">{row.address}</dd>
                <dd className="mt-1 text-xs text-slate-400 font-mono">
                  {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-50 pt-2.5">
                <dt className="text-slate-500">Khoảng cách:</dt>{" "}
                <dd className="font-medium text-slate-900">{row.distanceKm.toFixed(1)} km</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Trạng thái:</dt> 
                <dd className="font-medium text-slate-900">{statusTextMap[row.status]}</dd>
              </div>
            </dl>

            <button
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md active:translate-y-0"
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              Nhận ca
            </button>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-4">Mã ca</th>
              <th className="px-5 py-4">Thời gian</th>
              <th className="px-5 py-4">Mức độ</th>
              <th className="px-5 py-4">Vị trí</th>
              <th className="px-5 py-4 truncate">Cách</th>
              <th className="px-5 py-4">Trạng thái</th>
              <th className="px-5 py-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="group bg-white transition-colors hover:bg-slate-50/80">
                <td className="px-5 py-4 font-semibold text-slate-900">{row.id}</td>
                <td className="px-5 py-4 whitespace-nowrap text-slate-600">{row.createdAt}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClassMap[row.priority]}`}>
                    {priorityTextMap[row.priority]}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="max-w-[280px] font-medium text-slate-900 leading-snug">{row.address}</div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
                  </div>
                </td>
                <td className="px-5 py-4 whitespace-nowrap text-slate-600 font-medium">{row.distanceKm.toFixed(1)} km</td>
                <td className="px-5 py-4 whitespace-nowrap text-slate-600">{statusTextMap[row.status]}</td>
                <td className="px-5 py-4 text-right">
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 ring-1 ring-inset ring-slate-200 shadow-sm transition-all hover:bg-slate-50 hover:ring-slate-300" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-600">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    Nhận ca
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
