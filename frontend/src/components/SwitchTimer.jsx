import { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import api from '../api';

export default function SwitchTimer({ device, switchName, onTimerUpdate }) {
    const [showModal, setShowModal] = useState(false);
    const [duration, setDuration] = useState({ minutes: 5, seconds: 0 });
    const [timeRemaining, setTimeRemaining] = useState(null);

    // Calculate time remaining
    useEffect(() => {
        const timer = device.active_timers?.[switchName];
        if (!timer) {
            setTimeRemaining(null);
            return;
        }

        const updateRemaining = () => {
            const endTime = new Date(timer);
            const now = new Date();
            const diff = endTime - now;

            if (diff <= 0) {
                setTimeRemaining(null);
                onTimerUpdate?.();
            } else {
                const mins = Math.floor(diff / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
            }
        };

        updateRemaining();
        const interval = setInterval(updateRemaining, 1000);
        return () => clearInterval(interval);
    }, [device.active_timers, switchName, onTimerUpdate]);

    const handleSetTimer = async () => {
        try {
            const totalSeconds = (parseInt(duration.minutes) || 0) * 60 + (parseInt(duration.seconds) || 0);
            if (totalSeconds <= 0) return;

            await api.post(`/devices/${device.id}/timer`, null, {
                params: { switch: switchName, duration_seconds: totalSeconds }
            });
            setShowModal(false);
            onTimerUpdate?.();
        } catch (error) {
            console.error('Failed to set timer:', error);
        }
    };

    const handleCancelTimer = async (e) => {
        e.stopPropagation();
        try {
            await api.delete(`/devices/${device.id}/timer/${switchName}`);
            onTimerUpdate?.();
        } catch (error) {
            console.error('Failed to cancel timer:', error);
        }
    };

    if (timeRemaining) {
        return (
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
                <Clock className="w-3 h-3 text-orange-500 flex-shrink-0" />
                <span className="text-orange-600 font-medium whitespace-nowrap">{timeRemaining}</span>
                <button
                    onClick={handleCancelTimer}
                    className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                    title="Cancel timer"
                >
                    <X className="w-3 h-3 text-gray-500" />
                </button>
            </div>
        );
    }

    return (
        <>
            <button
                onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                className="p-1 hover:bg-gray-100 rounded"
                title="Set timer"
            >
                <Clock className="w-4 h-4 text-gray-400 hover:text-blue-500" />
            </button>

            {showModal && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold mb-4">Set Auto-Off Timer</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Switch will turn ON now and automatically turn OFF after:
                        </p>
                        <div className="flex gap-2 mb-4">
                            {[5, 15, 30, 60].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setDuration({ minutes: m, seconds: 0 })}
                                    className={`px-3 py-2 rounded ${duration.minutes === m && duration.seconds === 0 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 mb-4">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-1">Minutes</label>
                                <input
                                    type="number"
                                    value={duration.minutes}
                                    onChange={(e) => setDuration({ ...duration, minutes: parseInt(e.target.value) || 0 })}
                                    min="0"
                                    max="1440"
                                    className="w-full px-3 py-2 border rounded"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-1">Seconds</label>
                                <input
                                    type="number"
                                    value={duration.seconds}
                                    onChange={(e) => setDuration({ ...duration, seconds: parseInt(e.target.value) || 0 })}
                                    min="0"
                                    max="59"
                                    className="w-full px-3 py-2 border rounded"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSetTimer}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Start Timer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
