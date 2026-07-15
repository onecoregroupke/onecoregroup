import { FileText, Clock } from 'lucide-react'

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Weekly and monthly marketing performance reports</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex items-start gap-3">
        <Clock size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <h2 className="text-blue-900 font-semibold mb-1">Report Generation — Phase 2</h2>
          <p className="text-blue-700 text-sm leading-relaxed">
            AI-powered report generation is coming in Phase 2. Reports will be auto-generated weekly
            (Sunday 6PM) and monthly (1st of each month), with Groq AI narrative summaries and
            WhatsApp delivery. Once Instagram and YouTube API credentials are configured, data will
            be pulled automatically.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <FileText size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400 font-medium">No reports generated yet</p>
        <p className="text-gray-300 text-sm mt-1">
          Reports will appear here once API credentials are configured
        </p>
      </div>
    </div>
  )
}
