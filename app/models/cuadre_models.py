from datetime import date

from pydantic import BaseModel, field_validator


class CuadreEntrada(BaseModel):
    fecha: date
    base_anterior: float = 0.0
    forzar: bool = False

    @field_validator("base_anterior")
    @classmethod
    def validar_base(cls, v: float) -> float:
        if v < 0:
            raise ValueError("La base anterior no puede ser negativa")
        return v


class CuadreRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    diferencia: float = 0.0
    base_nueva: float = 0.0
    fecha_hora_registro: str = ""
