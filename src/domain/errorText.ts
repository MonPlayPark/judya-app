// Thai text for every error code of the medicine-changing functions (medicine.ts, step 3.2b-1) plus the one the
// data layer adds itself ('save_failed'). Short, and each one says what to do. The screens show these as they are.
import type { BackupError } from './backup';
import type {
  AddHouseItemError,
  AddShopError,
  CutHouseStockError,
  DeleteShopError,
  EditHouseItemError,
  EditShopError,
  RemoveHouseItemError,
  RestoreHouseItemError,
  SettingsError,
} from './actions';
import type {
  AddMedicineError,
  AddPersonError,
  AdjustDoseError,
  EditMedicineError,
  EditPersonError,
  RemovePersonError,
  ResumeMedicineError,
  RestorePersonError,
  StopMedicineError,
} from './medicine';

export type MedicineErrorCode =
  | AddPersonError
  | AddMedicineError
  | AdjustDoseError
  | StopMedicineError
  | ResumeMedicineError
  | EditMedicineError
  | EditPersonError
  | RemovePersonError
  | RestorePersonError
  | AddHouseItemError
  | EditHouseItemError
  | CutHouseStockError
  | RemoveHouseItemError
  | RestoreHouseItemError
  | AddShopError
  | EditShopError
  | DeleteShopError;

/** Added by the data layer when the change was valid but could not be written to the phone. */
export type ActionErrorCode = MedicineErrorCode | 'save_failed';

// Record over the whole union: adding a code to medicine.ts without a text here does not compile.
const TEXT: Record<ActionErrorCode, string> = {
  sample_present: 'ตอนนี้เป็นข้อมูลตัวอย่าง ต้องลบตัวอย่างก่อนจึงจะเพิ่มข้อมูลจริงได้',
  invalid_name: 'ชื่อสั้นหรือยาวเกินไป ชื่อสมาชิกใส่ 1–40 ตัวอักษร ชื่อยาใส่ 2–60 ตัวอักษร',
  invalid_relation: 'เลือกความสัมพันธ์ของสมาชิกอีกครั้ง',
  person_not_found: 'ไม่พบสมาชิกคนนี้ อาจถูกนำออกจากบ้านแล้ว กลับไปเลือกใหม่',
  invalid_color: 'เลือกสีโปรไฟล์อีกครั้ง',
  invalid_birth_year: 'ปีเกิดไม่ถูกต้อง ใส่ปี พ.ศ. 4 หลัก ตั้งแต่ 2400 ถึงปีปัจจุบัน',
  invalid_insurance: 'ชื่อบริษัทประกันยาวเกิน 60 ตัวอักษร ย่อให้สั้นลงหรือปล่อยว่าง',
  already_removed: 'นำสมาชิกคนนี้ออกจากบ้านไปแล้ว',
  not_removed: 'สมาชิกคนนี้ยังอยู่ในบ้าน ไม่ต้องนำกลับ',
  person_removed: 'สมาชิกคนนี้ถูกนำออกจากบ้านแล้ว เลือกสมาชิกคนอื่น',
  invalid_unit: 'ใส่หน่วยนับของยา เช่น เม็ด แคปซูล ซอง',
  invalid_schedule: 'วิธีกินยังไม่ถูกต้อง ตรวจช่วงเวลา จำนวน และวันที่ทานอีกครั้ง',
  invalid_qty: 'จำนวนต้องเป็นตัวเลข 0 ถึง 9999 ใส่ครึ่งหน่วยได้ เช่น 10.5',
  invalid_expiry: 'วันหมดอายุไม่ถูกต้อง เลือกวันที่จากปฏิทินอีกครั้ง',
  invalid_note: 'หมายเหตุว่างเปล่าหรือยาวเกิน 200 ตัวอักษร ย่อให้สั้นลงหรือลบออก',
  unit_mismatch: 'ยานี้มีในบ้านแล้วและใช้หน่วยอื่นอยู่ ต้องใช้หน่วยเดิมของยานี้',
  duplicate: 'สมาชิกคนนี้มียานี้ใช้อยู่แล้ว ไปแก้ที่หน้ายาทั้งหมดแทน',
  invalid_data: 'บันทึกไม่ได้เพราะมีบางอย่างผิดปกติ ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งทีมพัฒนา',
  assignment_not_found: 'ไม่พบยานี้ กลับไปที่ยาทั้งหมดแล้วเลือกใหม่',
  medication_not_found: 'ไม่พบข้อมูลยานี้ กลับไปที่ยาทั้งหมดแล้วเลือกใหม่',
  stopped: 'ยานี้หยุดใช้อยู่ กด “กลับมาใช้ยานี้อีก” ก่อนจึงจะปรับโดสได้',
  already_stopped: 'ยานี้หยุดใช้ไปแล้ว',
  not_stopped: 'ยานี้ยังใช้อยู่ ไม่ต้องกดกลับมาใช้',
  reason_required: 'เลือกเหตุผลก่อนบันทึก',
  no_change: 'ยังไม่ได้เปลี่ยนอะไร แก้ข้อมูลก่อนแล้วค่อยบันทึก',
  name_taken: 'มียาชื่อนี้อยู่ในบ้านแล้ว ใช้ชื่ออื่น หรือเพิ่มยานี้ให้สมาชิกจากหน้าเพิ่มยา',
  // house medicines and shops (step 3.3a)
  invalid_house_name: 'ชื่อยาต้องยาว 2–60 ตัวอักษร',
  invalid_house_qty: 'จำนวนคงเหลือต้องเป็นตัวเลข 0 ขึ้นไป หรือปล่อยว่างถ้าไม่ต้องการนับสต๊อก',
  invalid_house_unit: 'เลือกหรือพิมพ์หน่วยนับของจำนวนคงเหลือ',
  invalid_low_at: 'จำนวนที่ให้เตือนต้องเป็นตัวเลข 0 ขึ้นไป หรือปล่อยว่าง',
  low_at_needs_stock: 'ต้องใส่จำนวนคงเหลือก่อน จึงตั้งเตือนใกล้หมดได้',
  house_item_not_found: 'ไม่พบยาสามัญตัวนี้ กลับไปหน้ายาแล้วเลือกใหม่',
  house_item_removed: 'ยาตัวนี้ถูกลบไปแล้ว กด “นำกลับ” ก่อนจึงจะแก้ไขได้',
  house_already_removed: 'ยาตัวนี้ถูกลบไปแล้ว',
  house_not_removed: 'ยาตัวนี้ยังอยู่ในรายการ ไม่ต้องนำกลับ',
  no_stock: 'ใส่จำนวนคงเหลือก่อน จึงตัดจำนวนได้',
  invalid_cut: 'จำนวนที่ตัดต้องเป็นเลขเต็ม ตั้งแต่ 1 ขึ้นไป',
  cut_over_stock: 'ตัดไม่ได้ เพราะมากกว่าจำนวนที่เหลือ จำนวนยังเท่าเดิม',
  invalid_shop_name: 'ชื่อร้านต้องยาว 2–40 ตัวอักษร',
  invalid_phone: 'เบอร์โทรใช้ได้แค่ตัวเลข เว้นวรรค - และ + ยาว 6–20 ตัว หรือปล่อยว่าง',
  invalid_fee: 'ใส่ค่าส่งเป็นตัวเลข 0 ขึ้นไป (0 = ส่งฟรี)',
  invalid_free_over: 'ยอดส่งฟรีต้องมากกว่า 0 หรือเว้นว่าง',
  shop_not_found: 'ไม่พบร้านนี้ อาจถูกลบไปแล้ว',
  save_failed: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง (พื้นที่เก็บข้อมูลในเครื่องอาจเต็ม)',
};

export const errorText = (code: ActionErrorCode): string => TEXT[code];

/** Every code that has a text (used by the completeness test). */
export const ERROR_CODES = Object.keys(TEXT) as ActionErrorCode[];

// --- Backup / restore / settings (step 3.2d). Every restore text says the current data was not touched. ---

/** Why a chosen backup file was refused, or why restoring it failed after the check ('save_failed'). */
export type RestoreErrorCode = BackupError | 'save_failed';

const RESTORE_TEXT: Record<RestoreErrorCode, string> = {
  not_json: 'อ่านไฟล์นี้ไม่ได้ ไม่ใช่ไฟล์สำรองของ JudYa ข้อมูลปัจจุบันไม่ถูกแตะ',
  wrong_version: 'ไฟล์นี้เป็นข้อมูลคนละรุ่นกับแอพ จึงนำกลับไม่ได้ ข้อมูลปัจจุบันไม่ถูกแตะ',
  invalid: 'ไฟล์สำรองนี้ข้อมูลไม่ครบหรือเสียหาย นำกลับไม่ได้ ข้อมูลปัจจุบันไม่ถูกแตะ',
  too_big: 'ไฟล์ใหญ่เกิน 5 MB ไม่น่าใช่ไฟล์สำรองของ JudYa ข้อมูลปัจจุบันไม่ถูกแตะ',
  save_failed: 'บันทึกข้อมูลจากไฟล์ลงเครื่องไม่ได้ (พื้นที่เก็บอาจเต็ม) ข้อมูลปัจจุบันไม่ถูกแตะ',
};

export const restoreErrorText = (code: RestoreErrorCode): string => RESTORE_TEXT[code];
export const RESTORE_ERROR_CODES = Object.keys(RESTORE_TEXT) as RestoreErrorCode[];

export type SettingsErrorCode = SettingsError | 'save_failed';

const SETTINGS_TEXT: Record<SettingsErrorCode, string> = {
  invalid_expiry_days: 'จำนวนวันต้องเป็นเลขเต็ม 1 ถึง 365 ค่าเดิมยังอยู่',
  invalid_low_stock_days: 'จำนวนวันต้องเป็นเลขเต็ม 1 ถึง 60 ค่าเดิมยังอยู่',
  save_failed: 'บันทึกไม่ได้ ค่าเดิมยังอยู่ (พื้นที่เก็บข้อมูลในเครื่องอาจเต็ม)',
};

export const settingsErrorText = (code: SettingsErrorCode): string => SETTINGS_TEXT[code];
export const SETTINGS_ERROR_CODES = Object.keys(SETTINGS_TEXT) as SettingsErrorCode[];
