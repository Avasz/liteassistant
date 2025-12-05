import React, { useState, useEffect } from 'react';
import api from '../api';
import { Bell, Send, Save, CheckCircle, AlertCircle } from 'lucide-react';

const Notifications = () => {
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('telegram');
    const [status, setStatus] = useState({ type: '', message: '' });

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const response = await api.get('/notifications/');
            setConfigs(response.data);
        } catch (error) {
            console.error('Error fetching configs:', error);
        } finally {
            setLoading(false);
        }
    };

    const getConfig = (provider) => {
        return configs.find(c => c.provider === provider) || {
            provider,
            enabled: false,
            config: {},
            events: ['automation', 'schedule', 'timer']
        };
    };

    const handleSave = async (provider, data) => {
        try {
            setStatus({ type: 'info', message: 'Saving...' });
            await api.post('/notifications/', data);
            await fetchConfigs();
            setStatus({ type: 'success', message: 'Configuration saved successfully!' });
            setTimeout(() => setStatus({ type: '', message: '' }), 3000);
        } catch (error) {
            setStatus({ type: 'error', message: 'Failed to save configuration.' });
        }
    };

    const handleTest = async (provider, data) => {
        try {
            setStatus({ type: 'info', message: 'Sending test notification...' });
            await api.post('/notifications/test', {
                provider,
                config: data.config
            });
            setStatus({ type: 'success', message: 'Test notification sent!' });
            setTimeout(() => setStatus({ type: '', message: '' }), 3000);
        } catch (error) {
            setStatus({ type: 'error', message: `Failed to send test: ${error.response?.data?.detail || error.message}` });
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <Bell className="w-8 h-8 text-blue-500" />
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Notifications</h1>
            </div>

            {status.message && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${status.type === 'success' ? 'bg-green-100 text-green-700' :
                    status.type === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                    }`}>
                    {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {status.message}
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                    {['telegram', 'ntfy'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${activeTab === tab
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-gray-700 dark:text-blue-400'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {activeTab === 'telegram' && (
                        <ConfigForm
                            provider="telegram"
                            initialData={getConfig('telegram')}
                            onSave={handleSave}
                            onTest={handleTest}
                            fields={[
                                { name: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' },
                                { name: 'chat_id', label: 'Chat ID', type: 'text', placeholder: '123456789' }
                            ]}
                        />
                    )}
                    {activeTab === 'ntfy' && (
                        <ConfigForm
                            provider="ntfy"
                            initialData={getConfig('ntfy')}
                            onSave={handleSave}
                            onTest={handleTest}
                            fields={[
                                { name: 'topic', label: 'Topic', type: 'text', placeholder: 'my_secret_topic' },
                                { name: 'server_url', label: 'Server URL', type: 'text', placeholder: 'https://ntfy.sh' },
                                { name: 'priority', label: 'Priority', type: 'select', options: ['min', 'low', 'default', 'high', 'urgent'] },
                                { name: 'username', label: 'Username (Optional)', type: 'text', placeholder: 'user' },
                                { name: 'password', label: 'Password (Optional)', type: 'password', placeholder: 'pass' }
                            ]}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

const ConfigForm = ({ provider, initialData, onSave, onTest, fields }) => {
    const [enabled, setEnabled] = useState(initialData.enabled);
    const [config, setConfig] = useState(initialData.config);
    const [events, setEvents] = useState(initialData.events);

    useEffect(() => {
        setEnabled(initialData.enabled);
        setConfig(initialData.config);
        setEvents(initialData.events);
    }, [initialData]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(provider, { provider, enabled, config, events });
    };

    const handleEventToggle = (event) => {
        if (events.includes(event)) {
            setEvents(events.filter(e => e !== event));
        } else {
            setEvents([...events, event]);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Enable {provider.charAt(0).toUpperCase() + provider.slice(1)}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Turn on notifications for this provider</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {fields.map((field) => (
                    <div key={field.name} className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {field.label}
                        </label>
                        {field.type === 'select' ? (
                            <select
                                value={config[field.name] || ''}
                                onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                {field.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type={field.type}
                                value={config[field.name] || ''}
                                onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                                placeholder={field.placeholder}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        )}
                    </div>
                ))}
            </div>

            <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Notify on Events</h4>
                <div className="flex flex-wrap gap-4">
                    {['automation', 'schedule', 'timer'].map((event) => (
                        <label key={event} className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={events.includes(event)}
                                onChange={() => handleEventToggle(event)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{event}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={() => onTest(provider, { config })}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                    <Send size={18} />
                    Test
                </button>
                <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md hover:shadow-lg"
                >
                    <Save size={18} />
                    Save Configuration
                </button>
            </div>
        </form>
    );
};

export default Notifications;
