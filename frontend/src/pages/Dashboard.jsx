import { useState, useEffect } from 'react';
import api from '../api';
import DeviceCard from '../components/DeviceCard';
import { Search, Filter } from 'lucide-react';

export default function Dashboard() {
    const [devices, setDevices] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // all, online, offline, switch, sensor
    const [ws, setWs] = useState(null);

    useEffect(() => {
        loadDevices();
        connectWebSocket();

        return () => {
            if (ws) ws.close();
        };
    }, []);

    const loadDevices = async () => {
        try {
            const response = await api.get('/devices');
            setDevices(response.data);
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    };

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'mqtt_message') {
                // Optional: show toast or log
            } else if (data.type === 'device_update') {
                if (data.device) {
                    setDevices(prevDevices => {
                        const index = prevDevices.findIndex(d => d.id === data.device.id);
                        if (index !== -1) {
                            const newDevices = [...prevDevices];
                            newDevices[index] = data.device;
                            return newDevices;
                        } else {
                            // New device or not found, might want to fetch or add
                            // For now, if not found, we might still want to reload if it's a new discovery
                            // But to avoid storm, let's only add if we have the full object
                            return [...prevDevices, data.device];
                        }
                    });
                } else {
                    // Fallback for legacy messages or if device data missing
                    loadDevices();
                }
            }
        };

        socket.onclose = () => {
            setTimeout(connectWebSocket, 5000);
        };

        setWs(socket);
    };

    const filteredDevices = devices
        .filter(device => !device.dashboard_config?.hidden)
        .filter(device => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const name = (device.name || '').toLowerCase();
                const topic = (device.mqtt_topic || '').toLowerCase();
                const switchLabels = Object.values(device.switch_labels || {}).join(' ').toLowerCase();

                if (!name.includes(query) && !topic.includes(query) && !switchLabels.includes(query)) {
                    return false;
                }
            }

            // Status filter
            if (filterStatus === 'online' && !device.is_online) return false;
            if (filterStatus === 'offline' && device.is_online) return false;

            // Type filter (heuristic based on attributes)
            if (filterStatus === 'switch') {
                const hasSwitch = Object.keys(device.attributes || {}).some(k => k.startsWith('POWER'));
                if (!hasSwitch) return false;
            }
            if (filterStatus === 'sensor') {
                const hasSensor = Object.keys(device.attributes || {}).some(k => !k.startsWith('POWER') && k !== 'Time');
                if (!hasSensor) return false;
            }

            return true;
        })
        .sort((a, b) => {
            const nameA = a.name || a.mqtt_topic || '';
            const nameB = b.name || b.mqtt_topic || '';
            return nameA.localeCompare(nameB);
        });

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search devices..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors duration-200"
                    />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                    <Filter className="w-5 h-5 text-gray-400 mr-1 hidden md:block" />
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'online', label: 'Online' },
                        { id: 'offline', label: 'Offline' },
                        { id: 'switch', label: 'Switches' },
                        { id: 'sensor', label: 'Sensors' },
                    ].map(filter => (
                        <button
                            key={filter.id}
                            onClick={() => setFilterStatus(filter.id)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filterStatus === filter.id
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Device Grid */}
            {devices.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-sm text-center border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                        <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No devices found</h3>
                    <p className="text-gray-500 dark:text-gray-400">Configure MQTT settings to start discovering devices.</p>
                </div>
            ) : filteredDevices.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500">No devices match your search or filter.</p>
                    <button
                        onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}
                        className="mt-2 text-blue-600 hover:underline font-medium"
                    >
                        Clear filters
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredDevices.map((device) => (
                        <DeviceCard key={device.id} device={device} onUpdate={loadDevices} />
                    ))}
                </div>
            )}
        </div>
    );
}
