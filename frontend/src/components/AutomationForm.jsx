import { useState, useEffect } from 'react';
import api from '../api';
import { X } from 'lucide-react';

export default function AutomationForm({ onClose, onSuccess, initialData }) {
    const [devices, setDevices] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        enabled: true,
        trigger_type: 'mqtt',
        trigger_value: {},
        action_type: 'device_command',
        action_value: {}
    });

    useEffect(() => {
        loadDevices();
        if (initialData) {
            setFormData({
                name: initialData.name,
                enabled: initialData.enabled,
                trigger_type: initialData.trigger_type,
                trigger_value: initialData.trigger_value,
                action_type: initialData.action_type,
                action_value: initialData.action_value
            });
        }
    }, [initialData]);

    const loadDevices = async () => {
        try {
            const response = await api.get('/devices');
            setDevices(response.data);
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (initialData) {
                await api.put(`/automations/${initialData.id}`, formData);
            } else {
                await api.post('/automations', formData);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to save automation:', error);
            alert('Failed to save automation: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleTriggerTypeChange = (type) => {
        setFormData({
            ...formData,
            trigger_type: type,
            trigger_value: {}
        });
    };

    const handleActionTypeChange = (type) => {
        setFormData({
            ...formData,
            action_type: type,
            action_value: {}
        });
    };

    const updateTriggerValue = (key, value) => {
        setFormData({
            ...formData,
            trigger_value: { ...formData.trigger_value, [key]: value }
        });
    };

    const updateActionValue = (key, value) => {
        setFormData({
            ...formData,
            action_value: { ...formData.action_value, [key]: value }
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">{initialData ? 'Edit Automation' : 'Create Automation'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Automation Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Turn on pump when button pressed"
                            required
                        />
                    </div>

                    {/* Trigger Section */}
                    <div className="border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">When (Trigger)</h3>

                        <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Trigger Type
                            </label>
                            <select
                                value={formData.trigger_type}
                                onChange={(e) => handleTriggerTypeChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="mqtt">MQTT Topic</option>
                                <option value="time">Time Schedule</option>
                                <option value="device_state">Device State Change</option>
                            </select>
                        </div>

                        {/* MQTT Trigger */}
                        {formData.trigger_type === 'mqtt' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        MQTT Topic Pattern
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.trigger_value.topic || ''}
                                        onChange={(e) => updateTriggerValue('topic', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="e.g., stat/button/RESULT"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Supports wildcards: + (single level), # (multi-level)</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        JSON Path (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.trigger_value.payload_json_path || ''}
                                        onChange={(e) => updateTriggerValue('payload_json_path', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="e.g., POWER"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Expected Value (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.trigger_value.payload_json_value || ''}
                                        onChange={(e) => updateTriggerValue('payload_json_value', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="e.g., ON"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Time Trigger */}
                        {formData.trigger_type === 'time' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Hour (0-23)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="23"
                                            value={formData.trigger_value.hour || ''}
                                            onChange={(e) => updateTriggerValue('hour', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Minute (0-59)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={formData.trigger_value.minute || ''}
                                            onChange={(e) => updateTriggerValue('minute', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Device State Trigger */}
                        {formData.trigger_type === 'device_state' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Device
                                    </label>
                                    <select
                                        value={formData.trigger_value.device_id || ''}
                                        onChange={(e) => updateTriggerValue('device_id', parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    >
                                        <option value="">Select device...</option>
                                        {devices.map(device => (
                                            <option key={device.id} value={device.id}>
                                                {device.name || device.mqtt_topic}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formData.trigger_value.device_id && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Attribute
                                            </label>
                                            <select
                                                value={formData.trigger_value.attribute || ''}
                                                onChange={(e) => updateTriggerValue('attribute', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            >
                                                <option value="">Select attribute...</option>
                                                {/* Dynamic attributes from selected device */}
                                                {(() => {
                                                    const selectedDevice = devices.find(d => d.id === formData.trigger_value.device_id);
                                                    const attributes = selectedDevice?.attributes ? Object.keys(selectedDevice.attributes) : [];
                                                    // Add common ones if not present
                                                    const common = ['POWER', 'Dimmer', 'Color', 'CT', 'Voltage', 'Current', 'Power'];
                                                    const allOptions = Array.from(new Set([...attributes, ...common]));

                                                    return allOptions.map(attr => (
                                                        <option key={attr} value={attr}>{attr}</option>
                                                    ));
                                                })()}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Comparison Operator
                                            </label>
                                            <select
                                                value={formData.trigger_value.operator || '=='}
                                                onChange={(e) => updateTriggerValue('operator', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            >
                                                <option value="==">Equals (==)</option>
                                                <option value="!=">Not Equals (!=)</option>
                                                <option value="<">Less Than (&lt;)</option>
                                                <option value="<=">Less Than or Equal (&lt;=)</option>
                                                <option value=">">Greater Than (&gt;)</option>
                                                <option value=">=">Greater Than or Equal (&gt;=)</option>
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1">
                                                For numeric values, use comparison operators. For text, use equals or not equals.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Value
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.trigger_value.value || ''}
                                                onChange={(e) => updateTriggerValue('value', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                                placeholder="e.g., ON or 25"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                For Duration (minutes)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={formData.trigger_value.for_duration || 0}
                                                onChange={(e) => updateTriggerValue('for_duration', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                                placeholder="0 for immediate"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                If set &gt; 0, the device must stay in this state for this many minutes before triggering.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Action Section */}
                    <div className="border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">Then (Action)</h3>

                        <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Action Type
                            </label>
                            <select
                                value={formData.action_type}
                                onChange={(e) => handleActionTypeChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="device_command">Device Command</option>
                                <option value="mqtt_publish">MQTT Publish</option>
                            </select>
                        </div>

                        {/* Device Command Action */}
                        {formData.action_type === 'device_command' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Device
                                    </label>
                                    <select
                                        value={formData.action_value.device_id || ''}
                                        onChange={(e) => updateActionValue('device_id', parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    >
                                        <option value="">Select device...</option>
                                        {devices.map(device => (
                                            <option key={device.id} value={device.id}>
                                                {device.name || device.mqtt_topic}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Command
                                    </label>
                                    <select
                                        value={formData.action_value.command || ''}
                                        onChange={(e) => updateActionValue('command', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    >
                                        <option value="">Select command...</option>
                                        <option value="POWER">Power (POWER)</option>
                                        <option value="Dimmer">Brightness (Dimmer)</option>
                                        <option value="Color">Color</option>
                                        <option value="CT">Color Temp (CT)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Payload
                                    </label>
                                    <select
                                        value={formData.action_value.payload || ''}
                                        onChange={(e) => updateActionValue('payload', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    >
                                        <option value="">Select...</option>
                                        <option value="ON">ON</option>
                                        <option value="OFF">OFF</option>
                                        <option value="TOGGLE">TOGGLE</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* MQTT Publish Action */}
                        {formData.action_type === 'mqtt_publish' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Topic
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.action_value.topic || ''}
                                        onChange={(e) => updateActionValue('topic', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="e.g., cmnd/pump/POWER"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Payload
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.action_value.payload || ''}
                                        onChange={(e) => updateActionValue('payload', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="e.g., ON"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    <div className="flex gap-3">
                        <button
                            type="submit"
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-md transition-colors"
                        >
                            {initialData ? 'Save Changes' : 'Create Automation'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
