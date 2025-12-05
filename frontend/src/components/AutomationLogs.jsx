import { useState } from 'react';
import { X, Clock } from 'lucide-react';

export default function AutomationLogs({ automationId, automationName, onClose }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useState(() => {
        loadLogs();
    }, [automationId]);

    const loadLogs = async () => {
        try {
            const response = await fetch(`/api/automations/${automationId}/logs`);
            const data = await response.json();
            setLogs(data);
        } catch (error) {
            console.error('Failed to load logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTimestamp = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">
                        Execution History: {automationName}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-8">
                        <p className="text-gray-600">Loading logs...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-600">No execution history yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((log) => (
                            <div
                                key={log.id}
                                className={`border rounded-lg p-4 ${log.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-gray-500" />
                                        <span className="text-sm text-gray-600">
                                            {formatTimestamp(log.timestamp)}
                                        </span>
                                    </div>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-medium ${log.success
                                                ? 'bg-green-200 text-green-800'
                                                : 'bg-red-200 text-red-800'
                                            }`}
                                    >
                                        {log.success ? 'Success' : 'Failed'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="font-medium text-gray-700 mb-1">Trigger:</p>
                                        <pre className="bg-white p-2 rounded border text-xs overflow-x-auto">
                                            {JSON.stringify(log.trigger_data, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-700 mb-1">Action Result:</p>
                                        <pre className="bg-white p-2 rounded border text-xs overflow-x-auto">
                                            {JSON.stringify(log.action_result, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                {log.error_message && (
                                    <div className="mt-2">
                                        <p className="font-medium text-red-700 mb-1">Error:</p>
                                        <p className="text-sm text-red-600 bg-white p-2 rounded border border-red-200">
                                            {log.error_message}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
