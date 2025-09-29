from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    API_PREFIX: str = "/api/v1"
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173"]  # Vite dev
    MODEL_PROVIDER: str = "stub"  # later: "openai"
    class Config:
        env_file = ".env"

settings = Settings()
