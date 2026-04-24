import { useState, useEffect } from 'react';
import api from '../api';
import { Save, Server, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, Search } from 'lucide-react';

export default function Settings() {
    const [config, setConfig] = useState({
        broker_host: '',
        broker_port: 1883,
        username: '',
        password: '',
        discovery_prefix: 'tasmota/discovery',
        custom_topics: []
    });
    const [message, setMessage] = useState(null);
    const [deviceCount, setDeviceCount] = useState(0);
    const [devices, setDevices] = useState([]);
    const [showPassword, setShowPassword] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isDiscovering, setIsDiscovering] = useState(false);

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
            return response.data;
        } catch (error) {
            console.error('Failed to load devices:', error);
            return [];
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setMessage(null);
        try {
            const response = await api.post('/config/mqtt/test', config);
            setMessage({ type: 'success', text: response.data.message });
        } catch (error) {
            setMessage({ 
                type: 'error', 
                text: error.response?.data?.detail || 'Failed to connect to MQTT broker' 
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            await api.post('/config/mqtt', config);
            setMessage({ type: 'success', text: 'MQTT configuration saved successfully!' });
            // Show success for 3 seconds
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ 
                type: 'error', 
                text: 'Failed to save configuration: ' + (error.response?.data?.detail || error.message) 
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTriggerDiscovery = async () => {
        setIsDiscovering(true);
        setMessage(null);
        const initialCount = devices.length;

        try {
            await api.post('/config/mqtt/discover');
            
            // Poll for new devices for 10 seconds
            let attempts = 0;
            const interval = setInterval(async () => {
                const currentDevices = await loadDevices();
                attempts++;
                
                if (currentDevices.length > initialCount || attempts >= 5) {
                    clearInterval(interval);
                    setIsDiscovering(false);
                    if (currentDevices.length > initialCount) {
                        setMessage({ 
                            type: 'success', 
                            text: `Discovery complete! Found ${currentDevices.length - initialCount} new devices.` 
                        });
                    } else {
                        setMessage({ 
                            type: 'info', 
                            text: 'Discovery triggered. No new devices found yet.' 
                        });
                    }
                }
            }, 2000);

        } catch (error) {
            setIsDiscovering(false);
            setMessage({ 
                type: 'error', 
                text: 'Failed to trigger discovery: ' + (error.response?.data?.detail || error.message) 
            });
        }
    };

    return (
        <div className="animate-in fade-in duration-500">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Settings</h1>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-2xl border border-gray-100 dark:border-gray-700 transition-all duration-300 hover:shadow-xl">
                <h2 className="text-xl font-semibold mb-6 flex items-center text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-4">
                    <Server className="w-6 h-6 mr-3 text-blue-500" />
                    MQTT Broker Configuration
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Broker Host
                            </label>
                            <input
                                type="text"
                                value={config.broker_host}
                                onChange={(e) => setConfig({ ...config, broker_host: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white transition-all"
                                placeholder="localhost or mqtt.example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Port
                            </label>
                            <input
                                type="number"
                                value={config.broker_port}
                                onChange={(e) => setConfig({ ...config, broker_port: parseInt(e.target.value) })}
                                onFocus={(e) => e.target.select()}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white transition-all"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Username (optional)
                        </label>
                        <input
                            type="text"
                            value={config.username || ''}
                            onChange={(e) => setConfig({ ...config, username: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Password (optional)
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={config.password || ''}
                                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white transition-all pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Custom Topics (optional)
                        </label>
                        <textarea
                            value={config.custom_topics?.join('\n') || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                custom_topics: e.target.value.split('\n').filter(t => t.trim())
                            })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white font-mono text-sm transition-all"
                            placeholder="laser/status&#10;custom/+/data&#10;home/#"
                            rows="3"
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                            Enter custom MQTT topics to subscribe to (one per line). Supports wildcards: <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded text-blue-600 dark:text-blue-400">+</code> (single level), <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded text-blue-600 dark:text-blue-400">#</code> (multi-level).
                        </p>
                    </div>

                    {message && (
                        <div className={`flex items-center p-4 rounded-lg animate-in slide-in-from-top-2 duration-300 ${
                            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/30' : 
                            message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/30' :
                            'bg-blue-50 text-blue-800 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30'
                        }`}>
                            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-3 shrink-0" /> : 
                             message.type === 'error' ? <AlertCircle className="w-5 h-5 mr-3 shrink-0" /> :
                             <RefreshCw className="w-5 h-5 mr-3 shrink-0 animate-spin" />}
                            <span className="text-sm font-medium">{message.text}</span>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting || isSaving || !config.broker_host}
                            className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            {isTesting ? (
                                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            ) : (
                                <Server className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                            )}
                            Test Connection
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || isTesting}
                            className="flex-[1.5] bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition-all font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                        >
                            {isSaving ? (
                                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-5 h-5 mr-2" />
                            )}
                            Save Configuration
                        </button>
                    </div>
                </form>

                <div className="mt-12 pt-8 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                            <Search className="w-5 h-5 mr-2 text-green-500" />
                            Device Discovery
                        </h3>
                        <button
                            onClick={handleTriggerDiscovery}
                            disabled={isDiscovering}
                            className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center shadow-md ${
                                isDiscovering 
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed' 
                                : 'bg-green-600 text-white hover:bg-green-700 shadow-green-500/20'
                            }`}
                        >
                            {isDiscovering ? (
                                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            ) : (
                                <RefreshCw className="w-5 h-5 mr-2" />
                            )}
                            {isDiscovering ? 'Discovering...' : 'Refresh Discovery'}
                        </button>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Discovered devices will automatically appear here.
                            </p>
                            <p className="text-xs font-bold px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-700">
                                {deviceCount} Devices Found
                            </p>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {devices.map(device => (
                                <label key={device.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 hover:border-blue-500/50 dark:hover:border-blue-500/50 rounded-xl cursor-pointer transition-all group">
                                    <div className="flex items-center">
                                        <div className={`w-2 h-2 rounded-full mr-3 ${device.is_online ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {device.name || device.mqtt_topic}
                                        </span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={!device.dashboard_config?.hidden}
                                        onChange={async (e) => {
                                            const isVisible = e.target.checked;
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
                                                loadDevices();
                                            }
                                        }}
                                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 transition-all cursor-pointer"
                                    />
                                </label>
                            ))}
                            {devices.length === 0 && !isDiscovering && (
                                <div className="text-center py-8">
                                    <Server className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No devices found. Trigger discovery to begin.</p>
                                </div>
                            )}
                            {isDiscovering && devices.length === 0 && (
                                <div className="text-center py-8">
                                    <RefreshCw className="w-12 h-12 mx-auto text-blue-300 dark:text-blue-600 mb-3 animate-spin" />
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Searching for Tasmota devices...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

