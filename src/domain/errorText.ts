// Thai text for every error code of the medicine-changing functions (medicine.ts, step 3.2b-1) plus the one the
// data layer adds itself ('save_failed'). Short, and each one says what to do. The screens show these as they are.
import type {
  AddMedicineError,
  AddPersonError,
  AdjustDoseError,
  EditMedicineError,
  ResumeMedicineError,
  StopMedicineError,
} from './medicine';

export type MedicineErrorCode =
  | AddPersonError
  | AddMedicineError
  | AdjustDoseError
  | StopMedicineError
  | ResumeMedicineError
  | EditMedicineError;

/** Added by the data layer when the change was valid but could not be written to the phone. */
export type ActionErrorCode = MedicineErrorCode | 'save_failed';

// Record over the whole union: adding a code to medicine.ts without a text here does not compile.
const TEXT: Record<ActionErrorCode, string> = {
  sample_present: 'ตอนนี้เป็นข้อมูลตัวอย่าง ต้องลบตัวอย่างก่อนจึงจะเพิ่มข้อมูลจริงได้',
  invalid_name: 'ชื่อสั้นหรือยาวเกินไป ชื่อสมาชิกใส่ 1–40 ตัวอักษร ชื่อยาใส่ 2–60 ตัวอักษร',
  invalid_relation: 'เลือกความสัมพันธ์ของสมาชิกอีกครั้ง',
  person_not_found: 'ไม่พบสมาชิกคนนี้ กลับไปเลือกใหม่ในขั้นแรก',
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
  save_failed: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง (พื้นที่เก็บข้อมูลในเครื่องอาจเต็ม)',
};

export const errorText = (code: ActionErrorCode): string => TEXT[code];

/** Every code that has a text (used by the completeness test). */
export const ERROR_CODES = Object.keys(TEXT) as ActionErrorCode[];
