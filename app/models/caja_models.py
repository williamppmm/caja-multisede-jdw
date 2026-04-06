from datetime import date
from typing import Dict, List

from pydantic import BaseModel, field_validator


def _validar_texto_no_numerico_puro(value: str, nombre_campo: str, obligatorio: bool = True) -> str:
    texto = str(value or "").strip()
    if not texto:
        if obligatorio:
            raise ValueError(f"El campo {nombre_campo} es obligatorio")
        return ""
    if texto.isdigit():
        raise ValueError(f"El campo {nombre_campo} no puede contener solo números")
    return texto


class ConceptoValorItem(BaseModel):
    concepto: str = ""
    valor: float = 0

    @field_validator("concepto")
    @classmethod
    def validar_concepto(cls, v):
        return _validar_texto_no_numerico_puro(v, "concepto")


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
        return _validar_texto_no_numerico_puro(v, "nombre del cliente")

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
        return _validar_texto_no_numerico_puro(v, "nombre de la persona")

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
        return _validar_texto_no_numerico_puro(v, "concepto")

    @field_validator("observacion")
    @classmethod
    def validar_observacion(cls, v):
        return _validar_texto_no_numerico_puro(v, "observación", obligatorio=False)

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
