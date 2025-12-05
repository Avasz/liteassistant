import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Power, Thermometer, Droplets, Wind, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import SwitchTimer from '../components/SwitchTimer';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function SensorHistoryGraph({ device }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    // Load initial selection from localStorage or default to empty
    const [selectedSensors, setSelectedSensors] = useState(() => {
        const saved = localStorage.getItem(`sensor_selection_${device.id}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [timeRange, setTimeRange] = useState(1); // Default 1 hour

    useEffect(() => {
        loadHistory();
    }, [device.id, timeRange]);

    // Persist selection whenever it changes
    useEffect(() => {
        localStorage.setItem(`sensor_selection_${device.id}`, JSON.stringify(selectedSensors));
    }, [selectedSensors, device.id]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            // Pass timeRange as hours parameter
            const response = await api.get(`/devices/${device.id}/history`, {
                params: { limit: 1000, hours: timeRange }
            });
            // Process data: flatten nested JSON for recharts
            const processed = response.data.map(record => {
                const flatData = {};
                const flatten = (obj, prefix = '') => {
                    for (const key in obj) {
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            flatten(obj[key], prefix ? `${prefix}.${key}` : key);
                        } else {
                            flatData[prefix ? `${prefix}.${key}` : key] = obj[key];
                        }
                    }
                };
                flatten(record.data);
                return {
                    timestamp: new Date(record.timestamp).toLocaleTimeString(),
                    ...flatData
                };
            }).reverse(); // Recharts expects chronological order
            setHistory(processed);
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading && history.length === 0) return <div className="text-center py-4 text-gray-500">Loading history...</div>;

    // Get all available keys from latest data (or any data if latest is missing keys)
    // We scan up to 10 recent records to find all possible keys
    const availableKeys = new Set();
    history.slice(-10).forEach(record => {
        Object.keys(record).forEach(k => {
            if (k !== 'timestamp') availableKeys.add(k);
        });
    });
    const sortedKeys = Array.from(availableKeys).sort();

    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#8dd1e1', '#a4de6c', '#d0ed57'];

    const timeOptions = [
        { label: '1h', value: 1 },
        { label: '6h', value: 6 },
        { label: '12h', value: 12 },
        { label: '24h', value: 24 },
        { label: '7d', value: 168 },
    ];

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                {/* Sensor Selection */}
                <div className="flex flex-wrap gap-2">
                    {sortedKeys.length > 0 ? sortedKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => {
                                if (selectedSensors.includes(key)) {
                                    setSelectedSensors(selectedSensors.filter(k => k !== key));
                                } else {
                                    setSelectedSensors([...selectedSensors, key]);
                                }
                            }}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedSensors.includes(key)
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                }`}
                        >
                            {key}
                        </button>
                    )) : (
                        <span className="text-sm text-gray-500">No sensor data in this range</span>
                    )}
                </div>

                {/* Time Range Selection */}
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {timeOptions.map(option => (
                        <button
                            key={option.value}
                            onClick={() => setTimeRange(option.value)}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${timeRange === option.value
                                ? 'bg-white text-blue-600 shadow-sm font-medium'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {history.length > 0 ? (
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis
                                dataKey="timestamp"
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                                width={40}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend />
                            {selectedSensors.map((key, idx) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={colors[idx % colors.length]}
                                    strokeWidth={2}
                                    activeDot={{ r: 6 }}
                                    dot={false}
                                    isAnimationActive={false} // Disable animation for smoother updates
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-64 w-full flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <span className="text-gray-400">No data available for this time range</span>
                </div>
            )}
        </div>
    );
}

export default function DeviceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showRawData, setShowRawData] = useState(false);

    useEffect(() => {
        loadDevice();
        const interval = setInterval(loadDevice, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [id]);

    const loadDevice = async () => {
        try {
            const response = await api.get(`/devices/${id}`);
            setDevice(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Failed to load device:', error);
            setLoading(false);
        }
    };

    const handleToggleSwitch = async (switchName, currentState) => {
        try {
            const newState = currentState === 'ON' ? 'OFF' : 'ON';
            await api.post(`/devices/${id}/command`, null, {
                params: { command: switchName, payload: newState }
            });
            setTimeout(loadDevice, 500);
        } catch (error) {
            console.error('Failed to toggle switch:', error);
        }
    };

    const parseSensors = (attributes) => {
        if (!attributes) return [];

        const sensors = [];

        // Temperature sensors
        if (attributes.DS18B20) {
            sensors.push({ name: 'DS18B20 Temperature', value: attributes.DS18B20.Temperature, unit: '°C', icon: Thermometer });
        }
        if (attributes.DHT11) {
            if (attributes.DHT11.Temperature !== undefined) {
                sensors.push({ name: 'DHT11 Temperature', value: attributes.DHT11.Temperature, unit: '°C', icon: Thermometer });
            }
            if (attributes.DHT11.Humidity !== undefined) {
                sensors.push({ name: 'DHT11 Humidity', value: attributes.DHT11.Humidity, unit: '%', icon: Droplets });
            }
        }
        if (attributes.DHT22) {
            if (attributes.DHT22.Temperature !== undefined) {
                sensors.push({ name: 'DHT22 Temperature', value: attributes.DHT22.Temperature, unit: '°C', icon: Thermometer });
            }
            if (attributes.DHT22.Humidity !== undefined) {
                sensors.push({ name: 'DHT22 Humidity', value: attributes.DHT22.Humidity, unit: '%', icon: Droplets });
            }
        }

        // Air quality sensors
        if (attributes.MQ135) {
            sensors.push({ name: 'MQ-135 Gas', value: attributes.MQ135.Gas, unit: 'ppm', icon: Wind });
        }

        // Analog sensors
        if (attributes.ANALOG) {
            // Handle both object format {A0: value} and direct value
            const analogValue = typeof attributes.ANALOG === 'object' ? attributes.ANALOG.A0 : attributes.ANALOG;
            if (analogValue !== undefined) {
                sensors.push({ name: 'Analog Sensor', value: analogValue, unit: '', icon: Activity });
            }
        }

        // Energy monitoring
        if (attributes.ENERGY) {
            if (attributes.ENERGY.Power !== undefined) {
                sensors.push({ name: 'Power', value: attributes.ENERGY.Power, unit: 'W', icon: Activity });
            }
            if (attributes.ENERGY.Voltage !== undefined) {
                sensors.push({ name: 'Voltage', value: attributes.ENERGY.Voltage, unit: 'V', icon: Activity });
            }
            if (attributes.ENERGY.Current !== undefined) {
                sensors.push({ name: 'Current', value: attributes.ENERGY.Current, unit: 'A', icon: Activity });
            }
        }

        return sensors;
    };

    const parseSwitches = (attributes) => {
        if (!attributes) return [];

        const switches = [];

        // Check for POWER (single relay)
        if (attributes.POWER !== undefined) {
            switches.push({ name: 'POWER', state: attributes.POWER, label: 'Main Switch' });
        }

        // Check for POWER1-8 (multiple relays)
        for (let i = 1; i <= 8; i++) {
            const powerKey = `POWER${i}`;
            if (attributes[powerKey] !== undefined) {
                switches.push({ name: powerKey, state: attributes[powerKey], label: `Switch ${i}` });
            }
        }

        return switches;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-gray-600">Loading device...</div>
            </div>
        );
    }

    if (!device) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-gray-600">Device not found</div>
            </div>
        );
    }

    const sensors = parseSensors(device.attributes);
    const switches = parseSwitches(device.attributes);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-gray-800">
                        {device.name || device.mqtt_topic}
                    </h1>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span className={`flex items-center gap-1 ${device.is_online ? 'text-green-600' : 'text-red-600'}`}>
                            <span className={`w-2 h-2 rounded-full ${device.is_online ? 'bg-green-600' : 'bg-red-600'}`}></span>
                            {device.is_online ? 'Online' : 'Offline'}
                        </span>
                        {device.ip_address && <span>IP: {device.ip_address}</span>}
                        <span>Topic: {device.mqtt_topic}</span>
                    </div>
                </div>
            </div>

            {/* Switches Section */}
            {switches.length > 0 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Power className="w-5 h-5" />
                        Switches & Relays
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {switches.map((sw) => (
                            <div key={sw.name} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1 mr-2">
                                        {/* Inline Name Editing */}
                                        <input
                                            type="text"
                                            defaultValue={device.switch_labels?.[sw.name] || sw.label}
                                            onBlur={async (e) => {
                                                const newLabel = e.target.value.trim();
                                                if (newLabel && newLabel !== (device.switch_labels?.[sw.name] || sw.label)) {
                                                    try {
                                                        const updatedLabels = { ...device.switch_labels, [sw.name]: newLabel };
                                                        await api.put(`/devices/${id}`, {
                                                            mqtt_topic: device.mqtt_topic,
                                                            switch_labels: updatedLabels
                                                        });
                                                        loadDevice();
                                                    } catch (error) {
                                                        console.error('Failed to update switch label:', error);
                                                    }
                                                }
                                            }}
                                            className="w-full text-sm font-medium text-gray-700 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent"
                                            placeholder={sw.label}
                                            title="Click to rename"
                                        />
                                        <div className="text-xs text-gray-400">{sw.name}</div>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded ${sw.state === 'ON' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {sw.state}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleToggleSwitch(sw.name, sw.state)}
                                    className={`w-full py-2 px-4 rounded-md transition-colors ${sw.state === 'ON'
                                        ? 'bg-green-500 hover:bg-green-600 text-white'
                                        : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                                        }`}
                                >
                                    {sw.state === 'ON' ? 'Turn OFF' : 'Turn ON'}
                                </button>
                                <div className="mt-2 flex justify-center">
                                    <SwitchTimer
                                        device={device}
                                        switchName={sw.name}
                                        onTimerUpdate={loadDevice}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sensors Section */}
            {sensors.length > 0 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Sensors
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sensors.map((sensor, idx) => {
                            const Icon = sensor.icon;
                            return (
                                <div key={idx} className="border rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon className="w-5 h-5 text-blue-600" />
                                        <span className="text-sm text-gray-600">{sensor.name}</span>
                                    </div>
                                    <div className="text-2xl font-bold text-gray-800">
                                        {sensor.value} <span className="text-sm text-gray-600">{sensor.unit}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* No Data Message */}
            {sensors.length === 0 && switches.length === 0 && (
                <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-600">
                    No sensors or switches detected for this device.
                </div>
            )}

            {/* Sensor History Graph */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Sensor History
                </h2>
                <SensorHistoryGraph device={device} />
            </div>

            {/* Dashboard Configuration */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Dashboard Configuration
                </h2>
                <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">Select up to 3 sensors to display on the dashboard card:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {(() => {
                            const getAllKeys = (obj, prefix = '') => {
                                let keys = [];
                                for (const key in obj) {
                                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                                        // Skip complex objects if they are just containers for standard sensors we already parse?
                                        // No, let's flatten everything so user can pick specific values
                                        keys = [...keys, ...getAllKeys(obj[key], prefix ? `${prefix}.${key}` : key)];
                                    } else {
                                        keys.push(prefix ? `${prefix}.${key}` : key);
                                    }
                                }
                                return keys;
                            };

                            const availableKeys = getAllKeys(device.attributes);
                            const currentConfig = device.dashboard_config?.visible_sensors || [];

                            const handleCheckboxChange = async (key) => {
                                let newConfig = [...currentConfig];
                                if (newConfig.includes(key)) {
                                    newConfig = newConfig.filter(k => k !== key);
                                } else {
                                    if (newConfig.length >= 3) {
                                        alert("You can only select up to 3 sensors.");
                                        return;
                                    }
                                    newConfig.push(key);
                                }

                                // Optimistic update
                                const updatedDevice = {
                                    ...device,
                                    dashboard_config: { ...device.dashboard_config, visible_sensors: newConfig }
                                };
                                setDevice(updatedDevice);

                                try {
                                    await api.put(`/devices/${id}`, {
                                        mqtt_topic: device.mqtt_topic,
                                        dashboard_config: { visible_sensors: newConfig }
                                    });
                                } catch (error) {
                                    console.error("Failed to update dashboard config:", error);
                                    // Revert on error
                                    loadDevice();
                                }
                            };

                            return availableKeys.map(key => (
                                <label key={key} className="flex items-center space-x-2 text-sm cursor-pointer p-2 hover:bg-gray-50 rounded">
                                    <input
                                        type="checkbox"
                                        checked={currentConfig.includes(key)}
                                        onChange={() => handleCheckboxChange(key)}
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="truncate" title={key}>{key}</span>
                                </label>
                            ));
                        })()}
                    </div>
                </div>
            </div>

            {/* Raw Data Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <button
                    onClick={() => setShowRawData(!showRawData)}
                    className="flex items-center gap-2 text-lg font-semibold text-gray-800 hover:text-blue-600 transition-colors"
                >
                    {showRawData ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    Raw Device Data
                </button>
                {showRawData && (
                    <pre className="mt-4 bg-gray-50 p-4 rounded-lg overflow-auto text-xs">
                        {JSON.stringify(device, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}
