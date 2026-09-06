from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/hitry_lis_crm"
    # склад/меню/заказы — отдельная БД, за неё отвечает CRM-часть, а не аккаунты
    warehouse_database_url: str = "postgresql://postgres:postgres@localhost:5432/hitry_lis_warehouse"
    cookie_secure: bool = False
    session_ttl_days: int = 30

    @property
    def async_database_url(self) -> str:
        return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    @property
    def async_warehouse_database_url(self) -> str:
        return self.warehouse_database_url.replace("postgresql://", "postgresql+asyncpg://", 1)


settings = Settings()
