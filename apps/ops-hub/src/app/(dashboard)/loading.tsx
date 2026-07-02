export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-3 w-28 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
