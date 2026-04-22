import math
from datetime import date
from typing import Dict, List

from pydantic import BaseModel, field_validator


def _validar_texto_descriptivo(value: str, nombre_campo: str, obligatorio: bool = True) -> str:
    texto = str(value or "").strip()
    if not texto:
        if obligatorio:
            raise ValueError(f"El campo {nombre_campo} es obligatorio")
        return ""
    if not any(char.isalpha() for char in texto):
        raise ValueError(f"El campo {nombre_campo} debe incluir texto descriptivo")
    return texto


class ConceptoValorItem(BaseModel):
    concepto: str = ""
    valor: float = 0

    @field_validator("concepto")
    @classmethod
    def validar_concepto(cls, v):
        return _validar_texto_descriptivo(v, "concepto")


class CajaEntrada(BaseModel):
    fecha: date
    billetes: Dict[str, int]
    total_monedas: float
    billetes_viejos: float
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

    @field_validator("total_monedas", "billetes_viejos")
    @classmethod
    def validar_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El valor no puede ser negativo")
        return v


class PlataformasEntrada(BaseModel):
    fecha: date
    venta_practisistemas: float = 0
    venta_deportivas: float = 0
    forzar: bool = False

    @field_validator("venta_practisistemas")
    @classmethod
    def validar_practisistemas(cls, v):
        if v < 0:
            raise ValueError("La venta de Practisistemas no puede ser negativa")
        return v

    @field_validator("venta_deportivas")
    @classmethod
    def validar_deportivas(cls, v):
        # Acepta negativos: las pérdidas en Deportivas son válidas por negocio
        if not math.isfinite(v):
            raise ValueError("venta_deportivas debe ser un número finito")
        return v


class ModuloItemsEntrada(BaseModel):
    fecha: date
    items: List[ConceptoValorItem] = []
    forzar: bool = False


class BonoEntrada(BaseModel):
    fecha: date
    cliente: str
    valor: float
    forzar: bool = False

    @field_validator("cliente")
    @classmethod
    def validar_cliente(cls, v):
        return _validar_texto_descriptivo(v, "nombre del cliente")

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del bono debe ser mayor que cero")
        return v


class PrestamoEntrada(BaseModel):
    fecha: date
    persona: str
    tipo_movimiento: str = "prestamo"
    valor: float
    forzar: bool = False

    @field_validator("persona")
    @classmethod
    def validar_persona(cls, v):
        return _validar_texto_descriptivo(v, "nombre de la persona")

    @field_validator("tipo_movimiento")
    @classmethod
    def validar_tipo_movimiento(cls, v):
        tipo = str(v or "").strip().lower()
        if tipo not in {"prestamo", "pago"}:
            raise ValueError("El tipo de movimiento debe ser prestamo o pago")
        return tipo

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del prestamo debe ser mayor que cero")
        return v


class MovimientoEntrada(BaseModel):
    fecha: date
    tipo_movimiento: str
    concepto: str
    valor: float
    observacion: str = ""
    forzar: bool = False

    @field_validator("tipo_movimiento")
    @classmethod
    def validar_tipo_movimiento(cls, v):
        tipo = str(v or "").strip().lower()
        if tipo not in {"ingreso", "salida"}:
            raise ValueError("El tipo de movimiento debe ser ingreso o salida")
        return tipo

    @field_validator("concepto")
    @classmethod
    def validar_concepto(cls, v):
        return _validar_texto_descriptivo(v, "concepto")

    @field_validator("observacion")
    @classmethod
    def validar_observacion(cls, v):
        return _validar_texto_descriptivo(v, "observación", obligatorio=False)

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del movimiento debe ser mayor que cero")
        return v


class RegistroEliminarEntrada(BaseModel):
    fecha: date
    ts: str


class BonoRegistroEditarEntrada(BaseModel):
    fecha: date
    ts: str
    cliente: str
    valor: float

    @field_validator("cliente")
    @classmethod
    def validar_cliente(cls, v):
        return _validar_texto_descriptivo(v, "nombre del cliente")

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del bono debe ser mayor que cero")
        return v


class GastoRegistroEditarEntrada(BaseModel):
    fecha: date
    ts: str
    concepto: str
    valor: float

    @field_validator("concepto")
    @classmethod
    def validar_concepto(cls, v):
        return _validar_texto_descriptivo(v, "concepto")

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del gasto debe ser mayor que cero")
        return v


class PrestamoRegistroEditarEntrada(BaseModel):
    fecha: date
    ts: str
    persona: str
    tipo_movimiento: str = "prestamo"
    valor: float

    @field_validator("persona")
    @classmethod
    def validar_persona(cls, v):
        return _validar_texto_descriptivo(v, "nombre de la persona")

    @field_validator("tipo_movimiento")
    @classmethod
    def validar_tipo_movimiento(cls, v):
        tipo = str(v or "").strip().lower()
        if tipo not in {"prestamo", "pago"}:
            raise ValueError("El tipo de movimiento debe ser prestamo o pago")
        return tipo

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del prestamo debe ser mayor que cero")
        return v


class MovimientoRegistroEditarEntrada(BaseModel):
    fecha: date
    ts: str
    tipo_movimiento: str
    concepto: str
    valor: float
    observacion: str = ""

    @field_validator("tipo_movimiento")
    @classmethod
    def validar_tipo_movimiento(cls, v):
        tipo = str(v or "").strip().lower()
        if tipo not in {"ingreso", "salida"}:
            raise ValueError("El tipo de movimiento debe ser ingreso o salida")
        return tipo

    @field_validator("concepto")
    @classmethod
    def validar_concepto(cls, v):
        return _validar_texto_descriptivo(v, "concepto")

    @field_validator("observacion")
    @classmethod
    def validar_observacion(cls, v):
        return _validar_texto_descriptivo(v, "observación", obligatorio=False)

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v):
        if v <= 0:
            raise ValueError("El valor del movimiento debe ser mayor que cero")
        return v


class CajaRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    total_billetes: float = 0
    total_caja_fisica: float = 0
    fecha_hora_registro: str = ""


class PlataformasRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    venta_practisistemas: float = 0
    venta_deportivas: float = 0
    total_plataformas: float = 0
    fecha_hora_registro: str = ""


class ModuloItemsRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    total: float = 0
    cantidad_items: int = 0
    fecha_hora_registro: str = ""


class BonoRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    hora: str = ""
    cliente: str = ""
    valor: float = 0
    total_dia: float = 0
    fecha_hora_registro: str = ""


class PrestamoRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    persona: str = ""
    tipo_movimiento: str = ""
    valor: float = 0
    total_prestado: float = 0
    total_pagado: float = 0
    saldo_pendiente: float = 0
    fecha_hora_registro: str = ""


class MovimientoRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    tipo_movimiento: str = ""
    concepto: str = ""
    valor: float = 0
    observacion: str = ""
    total_ingresos: float = 0
    total_salidas: float = 0
    neto: float = 0
    fecha_hora_registro: str = ""
