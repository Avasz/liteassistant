import { useState, useEffect } from 'react';
import api from '../api';
import { X } from 'lucide-react';

export default function ScheduleForm({ onClose, onSuccess, initialData, devices }) {
    const [formData, setFormData] = useState({
        name: '',
        device_id: '',
        switch_name: 'POWER',
        schedule_type: 'daily',
        time: '12:00',
        days_of_week: [],
        date: '',
        duration: 0,
        duration_unit: 'minutes',
        interval_value: 30,
        interval_unit: 'minutes',
        total_duration_value: 0,
        total_duration_unit: 'hours',
        action: 'ON'
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                device_id: initialData.device_id,
                switch_name: initialData.switch_name,
                schedule_type: initialData.schedule_type,
                time: initialData.time,
                days_of_week: initialData.days_of_week || [],
                date: initialData.date || '',
                duration: initialData.duration,
                duration_unit: initialData.duration_unit || 'minutes',
                interval_value: initialData.interval_value || 30,
                interval_unit: initialData.interval_unit || 'minutes',
                total_duration_value: initialData.total_duration_value || 0,
                total_duration_unit: initialData.total_duration_unit || 'hours',
                action: initialData.action
            });
        }
    }, [initialData]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                name: formData.name,
                device_id: parseInt(formData.device_id),
                switch_name: formData.switch_name,
                schedule_type: formData.schedule_type,
                time: formData.time,
                days_of_week: formData.days_of_week,
                date: formData.date || null,
                duration: parseInt(formData.duration),
                duration_unit: formData.duration_unit,
                interval_value: parseInt(formData.interval_value),
                interval_unit: formData.interval_unit,
                total_duration_value: parseInt(formData.total_duration_value),
                total_duration_unit: formData.total_duration_unit,
                action: formData.action
            };

            if (initialData) {
                await api.put(`/schedules/${initialData.id}`, null, { params: payload });
            } else {
                await api.post('/schedules', null, { params: payload });
            }
            onSuccess();
        } catch (error) {
            console.error('Failed to save schedule:', error);
            alert('Failed to save schedule: ' + (error.response?.data?.detail || error.message));
        }
    };

    const selectedDevice = devices.find(d => d.id === parseInt(formData.device_id));
    const getPowerChannels = () => {
        if (!selectedDevice?.attributes) return ['POWER'];
        const channels = Object.keys(selectedDevice.attributes)
            .filter(key => key.match(/^POWER\d+$/))
            .sort();
        return channels.length > 0 ? channels : ['POWER'];
    };

    const toggleDay = (day) => {
        if (formData.days_of_week.includes(day)) {
            setFormData({
                ...formData,
                days_of_week: formData.days_of_week.filter(d => d !== day)
            });
        } else {
            setFormData({
                ...formData,
                days_of_week: [...formData.days_of_week, day].sort()
            });
        }
    };

    const days = [
        { label: 'Mon', value: 0 },
        { label: 'Tue', value: 1 },
        { label: 'Wed', value: 2 },
        { label: 'Thu', value: 3 },
        { label: 'Fri', value: 4 },
        { label: 'Sat', value: 5 },
        { label: 'Sun', value: 6 }
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">
                        {initialData ? 'Edit Schedule' : 'New Schedule'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Schedule Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Morning Lights"
                            required
                        />
                    </div>

                    {/* Device */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Device
                        </label>
                        <select
                            value={formData.device_id}
                            onChange={(e) => setFormData({ ...formData, device_id: e.target.value, switch_name: 'POWER' })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">Select device...</option>
                            {devices.map(device => (
                                <option key={device.id} value={device.id}>
                                    {device.name || device.mqtt_topic}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Switch */}
                    {formData.device_id && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Switch
                            </label>
                            <select
                                value={formData.switch_name}
                                onChange={(e) => setFormData({ ...formData, switch_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {getPowerChannels().map(channel => (
                                    <option key={channel} value={channel}>{channel}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Schedule Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Schedule Type
                        </label>
                        <select
                            value={formData.schedule_type}
                            onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="once">One-time</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="interval">Interval</option>
                        </select>
                    </div>

                    {/* Interval Configuration */}
                    {formData.schedule_type === 'interval' && (
                        <div className="space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Run Every
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.interval_value}
                                        onChange={(e) => setFormData({ ...formData, interval_value: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                    <select
                                        value={formData.interval_unit}
                                        onChange={(e) => setFormData({ ...formData, interval_unit: e.target.value })}
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="seconds">Seconds</option>
                                        <option value="minutes">Minutes</option>
                                        <option value="hours">Hours</option>
                                    </select>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500">
                                Schedule will run repeatedly aligned to midnight (00:00).
                            </p>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Stop Schedule After (Total Duration)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.total_duration_value}
                                        onChange={(e) => setFormData({ ...formData, total_duration_value: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <select
                                        value={formData.total_duration_unit}
                                        onChange={(e) => setFormData({ ...formData, total_duration_unit: e.target.value })}
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="seconds">Seconds</option>
                                        <option value="minutes">Minutes</option>
                                        <option value="hours">Hours</option>
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    0 = Indefinite. Example: Run every 10 seconds for 5 minutes = 30 runs.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Time (not for interval) */}
                    {formData.schedule_type !== 'interval' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Time
                            </label>
                            <input
                                type="time"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    )}

                    {/* Date (for one-time) */}
                    {formData.schedule_type === 'once' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date
                            </label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    )}

                    {/* Days (for weekly) */}
                    {formData.schedule_type === 'weekly' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Days of Week
                            </label>
                            <div className="flex gap-2">
                                {days.map(day => (
                                    <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => toggleDay(day.value)}
                                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${formData.days_of_week.includes(day.value)
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Action
                        </label>
                        <select
                            value={formData.action}
                            onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="ON">Turn ON</option>
                            <option value="OFF">Turn OFF</option>
                            <option value="TOGGLE">Toggle</option>
                        </select>
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {formData.schedule_type === 'interval' ? 'Turn On For' : 'Turn Off After (Duration)'}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                min="0"
                                value={formData.duration}
                                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <select
                                value={formData.duration_unit}
                                onChange={(e) => setFormData({ ...formData, duration_unit: e.target.value })}
                                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="seconds">Seconds</option>
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                            </select>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            0 = Indefinite (stays on until manually turned off)
                        </p>
                    </div>

                    {/* Submit */}
                    <div className="flex gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                        >
                            {initialData ? 'Save Changes' : 'Create Schedule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
