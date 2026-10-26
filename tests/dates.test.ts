import {test} from "node:test";
import assert from "node:assert/strict";
import {parseJalali,formatDate} from "../apps/web/lib/dates";
test("Jalali calendar roundtrip preserves the financial date and accepts Persian digits",()=>{assert.equal(parseJalali("۱۴۰۵/۰۱/۰۱"),"2026-03-21");assert.equal(formatDate("2026-03-21"),"۱۴۰۵/۰۱/۰۱");assert.equal(parseJalali("1403/12/30"),"2025-03-20");});
test("invalid civil dates cannot silently roll into a different month",()=>{for(const value of ["1404/12/30","1405/07/31","1405/13/1","1405/0/1","1405/1/0","bad",""])assert.equal(parseJalali(value),null,value);});
