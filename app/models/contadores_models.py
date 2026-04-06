from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


class ReferenciaCriticaEntrada(BaseModel):
    entradas: int = 0
    salidas: int = 0
    jackpot: int = 0
    observacion: str = ""

    @field_validator("entradas", "salidas", "jackpot")
    @classmethod
    def validar_no_negativo(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Los valores de referencia no pueden ser negativos")
        return int(value)

    @field_validator("observacion")
    @classmethod
    def validar_texto(cls, value: str) -> str:
        return str(value or "").strip()


class ContadorFilaEntrada(BaseModel):
    item_id: str
    entradas: int = 0
    salidas: int = 0
    jackpot: int = 0
    usar_referencia_critica: bool = False
    referencia_critica: ReferenciaCriticaEntrada | None = None
    produccion_pre_reset: int = 0

    @field_validator("item_id")
    @classmethod
    def validar_item_id(cls, value: str) -> str:
        texto = str(value or "").strip()
        if not texto:
            raise ValueError("El identificador del item es obligatorio")
        return texto

    @field_validator("entradas", "salidas", "jackpot", "produccion_pre_reset")
    @classmethod
    def validar_contadores(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Los contadores no pueden ser negativos")
        return int(value)

    @model_validator(mode="after")
    def validar_referencia_critica(self):
        if self.usar_referencia_critica and self.referencia_critica is None:
            raise ValueError("Debes completar la referencia crítica para este item")
        return self


class ContadoresEntrada(BaseModel):
    fecha: date
    items: list[ContadorFilaEntrada] = Field(default_factory=list)
    forzar: bool = False


class ContadoresRespuesta(BaseModel):
    ok: bool
    mensaje: str
    fecha: str = ""
    total_resultado: float = 0
    cantidad_items: int = 0
    fecha_hora_registro: str = ""
    alertas: int = 0


class ContadorCatalogoItem(BaseModel):
    item_id: str
    nombre: str
    denominacion: int
    activo: bool = True
    pausado: bool = False

    @field_validator("item_id", "nombre")
    @classmethod
    def validar_texto(cls, value: str) -> str:
        texto = str(value or "").strip()
        if not texto:
            raise ValueError("Este campo es obligatorio")
        return texto

    @field_validator("denominacion")
    @classmethod
    def validar_denominacion(cls, value: int) -> int:
        if int(value) <= 0:
            raise ValueError("La denominación debe ser mayor que cero")
        return int(value)
