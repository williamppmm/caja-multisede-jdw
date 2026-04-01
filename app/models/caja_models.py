from pydantic import BaseModel, field_validator, model_validator
from typing import Dict
from datetime import date


class CajaEntrada(BaseModel):
    fecha: date
    billetes: Dict[str, int]
    total_monedas: float
    billetes_viejos: float
    venta_practisistemas: float
    venta_deportivas: float
    forzar: bool = False

    @field_validator("billetes")
    @classmethod
    def validar_billetes(cls, v):
        from app.config import DENOMINACIONES
        permitidas = {str(d) for d in DENOMINACIONES}
        for denom, cantidad in v.items():
            if denom not in permitidas:
                raise ValueError(f"Denominación no permitida: {denom}")
            if not isinstance(cantidad, int) or cantidad < 0:
                raise ValueError(f"Cantidad inválida para {denom}: debe ser entero >= 0")
        return v

    @field_validator("total_monedas", "billetes_viejos", "venta_practisistemas")
    @classmethod
    def validar_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El valor no puede ser negativo")
        return v


class CajaRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    total_billetes: float = 0
    total_caja_fisica: float = 0
    fecha_hora_registro: str = ""
