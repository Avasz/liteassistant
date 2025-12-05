import { Power, Wifi, WifiOff, Settings, Save, Shield, Clock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../api';
import SwitchTimer from './SwitchTimer';

export default function DeviceCard({ device, onUpdate }) {
    const navigate = useNavigate();
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [selectedSensors, setSelectedSensors] = useState(device.dashboard_config?.visible_sensors || []);
    const [isProtected, setIsProtected] = useState(device.protected || false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingToggle, setPendingToggle] = useState(null);
    const [timerDisplays, setTimerDisplays] = useState({});

    const getPowerChannels = () => {
        if (!device.attributes) return [];
        const channels = Object.keys(device.attributes)
            .filter(key => key.match(/^POWER\d+$/))
            .sort();

        if (channels.length > 0) return channels;
        if (device.attributes?.POWER || device.attributes?.Power) return ['POWER'];
        return [];
    };

    const powerChannels = getPowerChannels();

    useEffect(() => {
        const updateTimers = () => {
            const newDisplays = {};
            const activeTimers = device.active_timers || {};

            for (const [switchName, endTimeStr] of Object.entries(activeTimers)) {
                const endTime = new Date(endTimeStr);
                const now = new Date();
                const diff = endTime - now;

                if (diff > 0) {
                    const mins = Math.floor(diff / 60000);
                    const secs = Math.floor((diff % 60000) / 1000);
                    newDisplays[switchName] = `${mins}:${secs.toString().padStart(2, '0')}`;
                }
            }

            setTimerDisplays(newDisplays);
        };

        updateTimers();
        const interval = setInterval(updateTimers, 1000);
        return () => clearInterval(interval);
    }, [device.active_timers]);

    const handleToggle = async (e, command = 'POWER') => {
        e.stopPropagation();

        const currentState = device.attributes?.[command] || 'OFF';
        const isTurningOff = currentState === 'ON' || currentState === '1';

        if (isTurningOff && device.protected) {
            setPendingToggle(command);
            setShowConfirmModal(true);
            return;
        }

        await executeToggle(command);
    };

    const executeToggle = async (command) => {
        try {
            await api.post(`/devices/${device.id}/command`, null, {
                params: { command: command, payload: 'TOGGLE' }
            });
            setTimeout(onUpdate, 500);
        } catch (error) {
            console.error('Failed to toggle device:', error);
        }
    };

    const handleConfirmToggle = async () => {
        setShowConfirmModal(false);
        if (pendingToggle) {
            await executeToggle(pendingToggle);
            setPendingToggle(null);
        }
    };

    const handleCancelToggle = () => {
        setShowConfirmModal(false);
        setPendingToggle(null);
    };

    const handleCardClick = () => {
        if (!isConfiguring) {
            navigate(`/devices/${device.id}`);
        }
    };

    const toggleConfig = (e) => {
        e.stopPropagation();
        setIsConfiguring(!isConfiguring);
        setSelectedSensors(device.dashboard_config?.visible_sensors || []);
        setIsProtected(device.protected || false);
    };

    const handleSensorToggle = (key) => {
        if (selectedSensors.includes(key)) {
            setSelectedSensors(selectedSensors.filter(k => k !== key));
        } else {
            if (selectedSensors.length < 3) {
                setSelectedSensors([...selectedSensors, key]);
            }
        }
    };

    const saveConfig = async (e) => {
        e.stopPropagation();
        try {
            await api.put(`/devices/${device.id}`, {
                ...device,
                protected: isProtected,
                dashboard_config: {
                    ...device.dashboard_config,
                    visible_sensors: selectedSensors
                }
            });
            setIsConfiguring(false);
            await onUpdate();
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    };

    const getAllKeys = (obj, prefix = '') => {
        let keys = [];
        for (const k in obj) {
            if (typeof obj[k] === 'object' && obj[k] !== null) {
                keys = [...keys, ...getAllKeys(obj[k], prefix ? `${prefix}.${k}` : k)];
            } else {
                keys.push(prefix ? `${prefix}.${k}` : k);
            }
        }
        return keys;
    };

    const availableSensors = device.attributes ? getAllKeys(device.attributes) : [];

    const formatName = (name) => {
        if (!name) return '';
        const parts = name.split(',').map(s => s.trim());
        if (parts.length > 1 && parts.every(p => p === parts[0])) {
            return parts[0];
        }
        return name;
    };

    return (
        <div
            onClick={handleCardClick}
            className={`bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all cursor-pointer h-full flex flex-col ${!device.is_online ? 'opacity-60' : ''
                }`}
        >
            {/* Header */}
            <div className="p-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-gray-900 truncate">
                                {formatName(device.name) || device.mqtt_topic}
                            </h3>
                            {device.protected && <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" title="Protected" />}
                        </div>
                        {device.name && device.name !== device.mqtt_topic && (
                            <p className="text-xs text-gray-500 truncate">{device.mqtt_topic}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={toggleConfig}
                            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                            title="Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        {device.is_online ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-full">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-xs font-medium text-green-700">Online</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-full">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                <span className="text-xs font-medium text-red-700">Offline</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4 flex-1 flex flex-col">
                {isConfiguring ? (
                    <div onClick={e => e.stopPropagation()} className="space-y-4">
                        <div>
                            <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded">
                                <input
                                    type="checkbox"
                                    checked={isProtected}
                                    onChange={(e) => setIsProtected(e.target.checked)}
                                    className="rounded text-blue-500 focus:ring-blue-500"
                                />
                                <span className="font-medium flex items-center gap-1">
                                    <Shield className="w-3 h-3" /> Protected Mode
                                </span>
                            </label>
                            <p className="text-xs text-gray-500 ml-8">Requires confirmation to turn OFF.</p>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold mb-2">Select Sensors (Max 3)</h4>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                                {availableSensors.map(key => (
                                    <label key={key} className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                                        <input
                                            type="checkbox"
                                            checked={selectedSensors.includes(key)}
                                            onChange={() => handleSensorToggle(key)}
                                            disabled={!selectedSensors.includes(key) && selectedSensors.length >= 3}
                                            className="rounded text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="truncate text-xs" title={key}>{key}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button
                                onClick={toggleConfig}
                                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveConfig}
                                className="px-3 py-1.5 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-md flex items-center gap-1"
                            >
                                <Save className="w-3 h-3" /> Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Switches */}
                        {powerChannels.length > 0 && (
                            <div className={`grid gap-2 mb-4 ${powerChannels.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {powerChannels.map(channel => {
                                    const state = device.attributes?.[channel] || 'OFF';
                                    const isChannelOn = state === 'ON' || state === '1';
                                    const customLabel = device.switch_labels?.[channel];
                                    const defaultLabel = powerChannels.length > 1
                                        ? channel.replace('POWER', 'Switch ')
                                        : 'Switch';
                                    const displayLabel = customLabel || defaultLabel;
                                    const hasTimer = timerDisplays[channel];

                                    return (
                                        <div key={channel} className="flex flex-col gap-1.5">
                                            <span className="text-xs font-medium text-gray-600 truncate" title={displayLabel}>
                                                {displayLabel}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => handleToggle(e, channel)}
                                                    disabled={!device.is_online}
                                                    className={`flex-1 flex items-center justify-center px-3 py-2.5 rounded-md transition-all text-sm font-medium min-h-[40px] ${hasTimer
                                                            ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
                                                            : isChannelOn
                                                                ? 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
                                                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                                                >
                                                    {hasTimer ? (
                                                        <>
                                                            <Clock className="w-4 h-4 mr-1.5" />
                                                            {timerDisplays[channel]}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Power className="w-4 h-4 mr-1.5" />
                                                            {isChannelOn ? 'ON' : 'OFF'}
                                                        </>
                                                    )}
                                                </button>
                                                {hasTimer ? (
                                                    <div className="flex-shrink-0 p-1" title="Timer active">
                                                        <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                                                    </div>
                                                ) : (
                                                    <SwitchTimer
                                                        device={device}
                                                        switchName={channel}
                                                        onTimerUpdate={onUpdate}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Metrics */}
                        {device.dashboard_config?.visible_sensors?.length > 0 && (
                            <div className="mt-auto pt-3 border-t border-gray-100">
                                <div className="flex items-center justify-around gap-2">
                                    {device.dashboard_config.visible_sensors.map(sensorKey => {
                                        const findValue = (obj, key) => {
                                            if (!obj) return undefined;
                                            if (obj[key] !== undefined) return obj[key];

                                            if (key.includes('.')) {
                                                const parts = key.split('.');
                                                let current = obj;
                                                for (const part of parts) {
                                                    if (current && current[part] !== undefined) {
                                                        current = current[part];
                                                    } else {
                                                        return undefined;
                                                    }
                                                }
                                                return current;
                                            }

                                            for (const k in obj) {
                                                if (typeof obj[k] === 'object' && obj[k] !== null) {
                                                    const found = findValue(obj[k], key);
                                                    if (found !== undefined) return found;
                                                }
                                            }
                                            return undefined;
                                        };

                                        const value = findValue(device.attributes, sensorKey);
                                        if (value !== undefined) {
                                            const displayValue = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
                                            const displayKey = sensorKey.split('.').pop();

                                            return (
                                                <div key={sensorKey} className="flex flex-col items-center" title={`${sensorKey}: ${value}`}>
                                                    <span className="text-base font-bold text-gray-900">{displayValue}</span>
                                                    <span className="text-xs text-gray-500 uppercase tracking-wide">{displayKey}</span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={handleCancelToggle}
                >
                    <div
                        className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="w-6 h-6 text-yellow-500" />
                            <h3 className="text-lg font-semibold text-gray-900">Confirm Action</h3>
                        </div>
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to turn OFF <strong>{pendingToggle}</strong> on <strong>{device.name || device.mqtt_topic}</strong>?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancelToggle}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmToggle}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                            >
                                Turn OFF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
