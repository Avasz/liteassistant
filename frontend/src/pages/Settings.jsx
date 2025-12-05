import { useState, useEffect } from 'react';
import api from '../api';
import { Save, Server } from 'lucide-react';

export default function Settings() {
    const [config, setConfig] = useState({
        broker_host: '',
        broker_port: 1883,
        username: '',
        password: '',
        discovery_prefix: 'tasmota/discovery',
        custom_topics: []
    });
    const [message, setMessage] = useState('');
    const [deviceCount, setDeviceCount] = useState(0);
    const [devices, setDevices] = useState([]);

    useEffect(() => {
        loadConfig();
        loadDevices();
    }, []);

    const loadConfig = async () => {
        try {
            const response = await api.get('/config/mqtt');
            if (response.data.broker_host) {
                setConfig(response.data);
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    };

    const loadDevices = async () => {
        try {
            const response = await api.get('/devices');
            setDevices(response.data);
            setDeviceCount(response.data.length);
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        try {
            await api.post('/config/mqtt', config);
            setMessage('MQTT configuration saved successfully!');
        } catch (error) {
            setMessage('Failed to save configuration: ' + (error.response?.data?.detail || error.message));
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>

            <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Server className="w-5 h-5 mr-2" />
                    MQTT Broker Configuration
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Broker Host
                        </label>
                        <input
                            type="text"
                            value={config.broker_host}
                            onChange={(e) => setConfig({ ...config, broker_host: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="localhost or mqtt.example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Broker Port
                        </label>
                        <input
                            type="number"
                            value={config.broker_port}
                            onChange={(e) => setConfig({ ...config, broker_port: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Username (optional)
                        </label>
                        <input
                            type="text"
                            value={config.username || ''}
                            onChange={(e) => setConfig({ ...config, username: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Password (optional)
                        </label>
                        <input
                            type="password"
                            value={config.password || ''}
                            onChange={(e) => setConfig({ ...config, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Custom Topics (optional)
                        </label>
                        <textarea
                            value={config.custom_topics?.join('\n') || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                custom_topics: e.target.value.split('\n').filter(t => t.trim())
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                            placeholder="laser/status&#10;custom/+/data&#10;home/#"
                            rows="4"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Enter custom MQTT topics to subscribe to (one per line). Supports wildcards: + (single level), # (multi-level).
                            <br />
                            Examples: <code className="bg-gray-100 px-1 rounded">laser/status</code>, <code className="bg-gray-100 px-1 rounded">sensor/+/temperature</code>
                        </p>
                    </div>

                    {message && (
                        <div className={`text-sm p-3 rounded ${message.toLowerCase().includes('success') || message.toLowerCase().includes('triggered') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Save Configuration
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-semibold mb-2">Device Discovery</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 mb-1">
                                If your devices are not showing up, you can trigger a manual discovery.
                            </p>
                            <p className="text-xs text-gray-500">
                                Currently discovered: <span className="font-medium text-gray-700">{deviceCount} devices</span>
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    await api.post('/config/mqtt/discover');
                                    setMessage('Discovery triggered! Check the dashboard in a few seconds.');
                                    // Refresh count after a delay
                                    setTimeout(loadDevices, 2000);
                                } catch (error) {
                                    setMessage('Failed to trigger discovery: ' + (error.response?.data?.detail || error.message));
                                }
                            }}
                            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center"
                        >
                            <Server className="w-4 h-4 mr-2" />
                            Refresh Discovery
                        </button>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Dashboard Visibility</h3>
                    <p className="text-sm text-gray-600 mb-4">
                        Select which devices should be visible on the dashboard.
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                        {devices.map(device => (
                            <label key={device.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <span className="text-sm font-medium text-gray-700">{device.name || device.mqtt_topic}</span>
                                <input
                                    type="checkbox"
                                    checked={!device.dashboard_config?.hidden}
                                    onChange={async (e) => {
                                        const isVisible = e.target.checked;
                                        // Optimistic update
                                        const updatedDevices = devices.map(d =>
                                            d.id === device.id
                                                ? { ...d, dashboard_config: { ...d.dashboard_config, hidden: !isVisible } }
                                                : d
                                        );
                                        setDevices(updatedDevices);

                                        try {
                                            await api.put(`/devices/${device.id}`, {
                                                mqtt_topic: device.mqtt_topic,
                                                dashboard_config: { ...device.dashboard_config, hidden: !isVisible }
                                            });
                                        } catch (error) {
                                            console.error('Failed to update visibility:', error);
                                            loadDevices(); // Revert on error
                                        }
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                            </label>
                        ))}
                        {devices.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-2">No devices found.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
