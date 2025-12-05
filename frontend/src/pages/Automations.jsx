import { useState, useEffect } from 'react';
import api from '../api';
import { Plus, Trash2, Power, History, Play, Zap, Pencil } from 'lucide-react';
import AutomationForm from '../components/AutomationForm';
import AutomationLogs from '../components/AutomationLogs';

export default function Automations() {
    const [automations, setAutomations] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [selectedAutomation, setSelectedAutomation] = useState(null);
    const [editingAutomation, setEditingAutomation] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [automationToDelete, setAutomationToDelete] = useState(null);

    useEffect(() => {
        loadAutomations();
    }, []);

    const loadAutomations = async () => {
        try {
            const response = await api.get('/automations');
            setAutomations(response.data);
        } catch (error) {
            console.error('Failed to load automations:', error);
        }
    };

    const handleDelete = async (id) => {
        setAutomationToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!automationToDelete) return;

        try {
            await api.delete(`/automations/${automationToDelete}`);
            loadAutomations();
        } catch (error) {
            console.error('Failed to delete automation:', error);
        } finally {
            setShowDeleteModal(false);
            setAutomationToDelete(null);
        }
    };

    const handleToggle = async (id) => {
        try {
            await api.post(`/automations/${id}/toggle`);
            loadAutomations();
        } catch (error) {
            console.error('Failed to toggle automation:', error);
        }
    };

    const handleTest = async (id, name) => {
        try {
            await api.post(`/automations/${id}/test`);
            alert(`Automation "${name}" triggered successfully!`);
        } catch (error) {
            console.error('Failed to test automation:', error);
            alert('Failed to test automation: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleEdit = (automation) => {
        setEditingAutomation(automation);
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingAutomation(null);
    };

    const getTriggerDescription = (automation) => {
        const { trigger_type, trigger_value } = automation;

        if (trigger_type === 'mqtt') {
            const topic = trigger_value.topic || 'unknown';
            const path = trigger_value.payload_json_path;
            const value = trigger_value.payload_json_value;

            if (path && value) {
                return `MQTT: ${topic} (${path} = ${value})`;
            }
            return `MQTT: ${topic}`;
        } else if (trigger_type === 'time') {
            const hour = String(trigger_value.hour || 0).padStart(2, '0');
            const minute = String(trigger_value.minute || 0).padStart(2, '0');
            return `Time: ${hour}:${minute} daily`;
        } else if (trigger_type === 'device_state') {
            return `Device State: ${trigger_value.attribute} = ${trigger_value.value}`;
        }
        return trigger_type;
    };

    const getActionDescription = (automation) => {
        const { action_type, action_value } = automation;

        if (action_type === 'device_command') {
            return `Device Command: ${action_value.command} ${action_value.payload}`;
        } else if (action_type === 'mqtt_publish') {
            return `MQTT Publish: ${action_value.topic} → ${action_value.payload}`;
        }
        return action_type;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                    <Zap className="w-8 h-8 mr-3 text-yellow-500" />
                    Automations
                </h1>
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center transition-colors"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    New Automation
                </button>
            </div>

            {showForm && (
                <AutomationForm
                    onClose={handleFormClose}
                    onSuccess={loadAutomations}
                    initialData={editingAutomation}
                />
            )}

            {selectedAutomation && (
                <AutomationLogs
                    automationId={selectedAutomation.id}
                    automationName={selectedAutomation.name}
                    onClose={() => setSelectedAutomation(null)}
                />
            )}

            <div className="space-y-4">
                {automations.length === 0 ? (
                    <div className="bg-white p-8 rounded-lg shadow text-center">
                        <p className="text-gray-600">No automations configured yet.</p>
                        <p className="text-sm text-gray-500 mt-2">
                            Click "New Automation" to create your first automation rule.
                        </p>
                    </div>
                ) : (
                    automations.map((automation) => (
                        <div
                            key={automation.id}
                            className={`bg-white rounded-lg shadow-md p-6 ${!automation.enabled ? 'opacity-60' : ''
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-semibold text-gray-800">
                                            {automation.name}
                                        </h3>
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-medium ${automation.enabled
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-600'
                                                }`}
                                        >
                                            {automation.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                                        <p>
                                            <span className="font-medium">When:</span>{' '}
                                            {getTriggerDescription(automation)}
                                        </p>
                                        <p>
                                            <span className="font-medium">Then:</span>{' '}
                                            {getActionDescription(automation)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleToggle(automation.id)}
                                        className={`p-2 rounded transition-colors ${automation.enabled
                                            ? 'text-green-600 hover:bg-green-50'
                                            : 'text-gray-400 hover:bg-gray-50'
                                            }`}
                                        title={automation.enabled ? 'Disable' : 'Enable'}
                                    >
                                        <Power className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(automation)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Edit automation"
                                    >
                                        <Pencil className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleTest(automation.id, automation.name)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Test automation"
                                    >
                                        <Play className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setSelectedAutomation(automation)}
                                        className="p-2 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                        title="View execution history"
                                    >
                                        <History className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(automation.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Delete automation"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={() => setShowDeleteModal(false)}
                >
                    <div
                        className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Deletion</h3>
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to delete this automation? This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
