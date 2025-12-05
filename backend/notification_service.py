import logging
import aiohttp
from typing import List, Dict, Any
from sqlalchemy.future import select
from . import models, database

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.configs: List[models.NotificationConfig] = []

    async def load_config(self):
        """Load notification configurations from database"""
        async with database.AsyncSessionLocal() as db:
            result = await db.execute(select(models.NotificationConfig))
            self.configs = result.scalars().all()
            logger.info(f"Loaded {len(self.configs)} notification configurations")

    async def notify(self, event_type: str, message: str):
        """Send notification to all enabled providers for the given event type"""
        # Reload config to ensure we have latest settings
        await self.load_config()
        
        for config in self.configs:
            if not config.enabled:
                continue
                
            if event_type not in config.events:
                continue
                
            try:
                if config.provider == "telegram":
                    await self.send_telegram(message, config.config)
                elif config.provider == "ntfy":
                    await self.send_ntfy(message, config.config)
            except Exception as e:
                logger.error(f"Failed to send {config.provider} notification: {e}")

    async def send_telegram(self, message: str, config: Dict[str, Any]):
        """Send Telegram notification"""
        bot_token = config.get("bot_token")
        chat_id = config.get("chat_id")
        
        if not bot_token or not chat_id:
            logger.warning("Telegram config missing bot_token or chat_id")
            return

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    text = await response.text()
                    raise Exception(f"Telegram API error: {text}")
                logger.info("Telegram notification sent")

    async def send_ntfy(self, message: str, config: Dict[str, Any]):
        """Send ntfy.sh notification"""
        topic = config.get("topic")
        server_url = config.get("server_url", "https://ntfy.sh")
        priority = config.get("priority", "default")
        
        if not topic:
            logger.warning("Ntfy config missing topic")
            return

        url = f"{server_url}/{topic}"
        headers = {
            "Title": "LiteAssistant Notification",
            "Priority": priority
        }
        
        username = config.get("username")
        password = config.get("password")
        if username and password:
            import base64
            auth_str = f"{username}:{password}"
            b64_auth = base64.b64encode(auth_str.encode()).decode()
            headers["Authorization"] = f"Basic {b64_auth}"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=message, headers=headers) as response:
                if response.status != 200:
                    text = await response.text()
                    raise Exception(f"Ntfy API error: {text}")
                logger.info("Ntfy notification sent")


# Global instance
notification_service = NotificationService()
