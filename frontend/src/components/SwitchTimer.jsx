import { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import api from '../api';

export default function SwitchTimer({ device, switchName, onTimerUpdate }) {
    const [showModal, setShowModal] = useState(false);
    const [duration, setDuration] = useState({ minutes: 5, seconds: 0 });
    const [timeRemaining, setTimeRemaining] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        setIsSubmitting(true);
        try {
            const totalSeconds = (parseInt(duration.minutes) || 0) * 60 + (parseInt(duration.seconds) || 0);
            if (totalSeconds <= 0) return;

            await api.post(`/devices/${device.id}/timer`, null, {
                params: { switch: switchName, duration_seconds: totalSeconds }
            });
            console.log('Timer set successfully, calling onTimerUpdate');
            setShowModal(false);
            if (onTimerUpdate) {
                onTimerUpdate();
            } else {
                console.warn('onTimerUpdate is not defined');
            }
        } catch (error) {
            console.error('Failed to set timer:', error);
            alert('Failed to set timer: ' + (error.response?.data?.detail || error.message));
        } finally {
            setIsSubmitting(false);
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
                    onClick={() => !isSubmitting && setShowModal(false)}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl border border-gray-200 dark:border-gray-700 transition-colors duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Set Auto-Off Timer</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            Switch will turn ON now and automatically turn OFF after:
                        </p>
                        <div className="flex gap-2 mb-4">
                            {[5, 15, 30, 60].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setDuration({ minutes: m, seconds: 0 })}
                                    disabled={isSubmitting}
                                    className={`px-3 py-2 rounded transition-colors ${duration.minutes === m && duration.seconds === 0
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                                        } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 mb-4">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Minutes</label>
                                <input
                                    type="number"
                                    value={duration.minutes}
                                    onChange={(e) => setDuration({ ...duration, minutes: parseInt(e.target.value) || 0 })}
                                    onFocus={(e) => e.target.select()}
                                    min="0"
                                    max="1440"
                                    disabled={isSubmitting}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Seconds</label>
                                <input
                                    type="number"
                                    value={duration.seconds}
                                    onChange={(e) => setDuration({ ...duration, seconds: parseInt(e.target.value) || 0 })}
                                    onFocus={(e) => e.target.select()}
                                    min="0"
                                    max="59"
                                    disabled={isSubmitting}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSetTimer}
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                            >
                                {isSubmitting ? 'Starting...' : 'Start Timer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
