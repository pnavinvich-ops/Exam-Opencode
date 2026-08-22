'use strict';

const { q, tx, nowIso, audit, ensureSchema, isRemote } = require('./db');
const { hashPassword } = require('./auth');
const { iso, buildExamItems, sampleByBlueprint } = require('./examEngine');

const TOPICS = [
  ['การเคลื่อนที่และแรง', 'Motion & Force'],
  ['งานและพลังงาน', 'Work & Energy'],
  ['ความร้อน', 'Heat'],
  ['คลื่นและเสียง', 'Waves & Sound'],
  ['แสงและทัศนศาสตร์', 'Light & Optics'],
  ['ไฟฟ้าและแม่เหล็ก', 'Electricity & Magnetism'],
];

// {topic, diff, q_th, q_en, c_th[5], c_en[5], correct, e_th, e_en}
const ITEMS = [
  // ---- Topic 1: Motion & Force ----
  { topic: 1, diff: 1, q_th: 'หน่วยของแรงในระบบ SI คือข้อใด', q_en: 'What is the SI unit of force?',
    c_th: ['วัตต์', 'จูล', 'นิวตัน', 'ปาสกาล', 'เคลวิน'], c_en: ['Watt', 'Joule', 'Newton', 'Pascal', 'Kelvin'], correct: 2,
    e_th: 'แรงวัดหน่วยเป็นนิวตัน (N) จากความสัมพันธ์ F = ma', e_en: 'Force is measured in newtons (N) from F = ma.' },
  { topic: 1, diff: 1, q_th: 'วัตถุวางนิ่งบนพื้นโต๊ะ แรงลัพธ์ที่กระทำต่อวัตถุเป็นเท่าใด', q_en: 'An object rests on a table. What is the net force acting on it?',
    c_th: ['เท่ากับน้ำหนักของวัตถุ', 'เท่ากับศูนย์', 'มากกว่าน้ำหนักของวัตถุ', 'น้อยกว่าน้ำหนักแต่ไม่เป็นศูนย์', 'ขึ้นอยู่กับวัสดุของโต๊ะ'], c_en: ['Equal to its weight', 'Zero', 'Greater than its weight', 'Less than its weight but nonzero', 'Depends on table material'], correct: 1,
    e_th: 'วัตถุอยู่นิ่งจึงอยู่ในสภาพสมดุล แรงตั้งฉากจากโต๊ะสมดุลกับน้ำหนัก ผลรวมแรงเป็นศูนย์', e_en: 'A resting object is in equilibrium; the normal force balances its weight, so net force is zero.' },
  { topic: 1, diff: 2, q_th: 'รถยนต์วิ่งด้วยอัตราเร็ว 20 m/s แล้วใช้เบรกจนหยุดภายในเวลา 5 s ความเร่งเฉลี่ยของรถมีค่าเท่าใด', q_en: 'A car moving at 20 m/s brakes to a stop in 5 s. What is its average acceleration?',
    c_th: ['0.25 m/s²', '4 m/s²', '10 m/s²', '20 m/s²', '100 m/s²'], c_en: ['0.25 m/s²', '4 m/s²', '10 m/s²', '20 m/s²', '100 m/s²'], correct: 1,
    e_th: 'a = Δv/Δt = (0 − 20)/5 = −4 m/s² ขนาดเท่ากับ 4 m/s² (ทิศช้างการเคลื่อนที่)', e_en: 'a = Δv/Δt = (0 − 20)/5 = −4 m/s², magnitude 4 m/s² opposite the motion.' },
  { topic: 1, diff: 2, q_th: 'หินร่วงลงอย่างอิสระจากที่สูง (ใช้ g ≈ 10 m/s²) เมื่อเวลาผ่านไป 2 s หินตกได้ระยะทางเท่าใด', q_en: 'A stone falls freely from rest (g ≈ 10 m/s²). How far has it fallen after 2 s?',
    c_th: ['10 m', '20 m', '30 m', '40 m', '100 m'], c_en: ['10 m', '20 m', '30 m', '40 m', '100 m'], correct: 1,
    e_th: 's = ½gt² = ½ × 10 × 2² = 20 m', e_en: 's = ½gt² = ½ × 10 × 2² = 20 m.' },
  { topic: 1, diff: 3, q_th: 'ก้อนไม้มวล 4 kg ถูกดึงด้วยแรง 20 N ในแนวราบบนพื้นที่มีสัมประสิทธิ์ความฝืดสถิต μk = 0.2 (ใช้ g ≈ 10 m/s²) ก้อนไม้มีความเร่งเท่าใด', q_en: 'A 4 kg block on a floor is pulled horizontally with 20 N. The kinetic friction coefficient is 0.2 (g ≈ 10 m/s²). Find its acceleration.',
    c_th: ['1 m/s²', '2 m/s²', '3 m/s²', '5 m/s²', '8 m/s²'], c_en: ['1 m/s²', '2 m/s²', '3 m/s²', '5 m/s²', '8 m/s²'], correct: 2,
    e_th: 'แรงฝืด f = μmg = 0.2 × 4 × 10 = 8 N แรงลัพธ์ = 20 − 8 = 12 N ⇒ a = 12/4 = 3 m/s²', e_en: 'Friction f = μmg = 8 N; net force 12 N ⇒ a = 12/4 = 3 m/s².' },
  { topic: 1, diff: 3, q_th: 'เหตุใดการขว้างวัตถุที่มุมยกฐาน 45° บนพื้นราบจึงได้ระยะพุ่งไกลที่สุด (ไม่คิดแรงต้านอากาศ)', q_en: 'Why does a projectile launched at 45° achieve maximum range on level ground (ignoring air resistance)?',
    c_th: ['เพราะลอยอยู่ในอากาศนานที่สุด', 'เพราะองค์ประกอบความเร็วแนวตั้งมีค่ามากที่สุด', 'เพราะ R = u²sin2θ/g มีค่าสูงสุดเมื่อ sin2θ = 1 ที่ θ = 45°', 'เพราะแรงโน้มถ่วงมีค่าน้อยลงที่มุมนี้', 'เพราะความเร่งแนวราบเป็นศูนย์พอดี'], c_en: ['Airtime is longest', 'Vertical velocity component is largest', 'R = u²sin2θ/g is maximal when sin2θ = 1 at θ = 45°', 'Gravity is weaker at this angle', 'Horizontal acceleration becomes zero'], correct: 2,
    e_th: 'ระยะพุ่ง R = u²sin2θ/g เกิดค่าสูงสุดเมื่อ sin2θ = 1 ซึ่ง 2θ = 90° ⇒ θ = 45°', e_en: 'Range R = u²sin2θ/g peaks when sin2θ = 1, i.e., 2θ = 90° ⇒ θ = 45°.' },

  // ---- Topic 2: Work & Energy ----
  { topic: 2, diff: 1, q_th: 'งานและพลังงานในระบบ SI มีหน่วยเป็นข้อใด', q_en: 'What is the SI unit of work and energy?',
    c_th: ['วัตต์', 'จูล', 'นิวตัน', 'ปาสกาล', 'กิโลกรัม'], c_en: ['Watt', 'Joule', 'Newton', 'Pascal', 'Kilogram'], correct: 1,
    e_th: 'งาน = แรง × การกระจัด มีหน่วยนิวตัน·เมตร ซึ่งเรียกว่าจูล (J)', e_en: 'Work = force × displacement, i.e., newton-metre, called the joule (J).' },
  { topic: 2, diff: 1, q_th: 'พลังงานจลน์ของวัตถุขึ้นอยู่กับปัจจัยใด', q_en: 'Kinetic energy of an object depends on which factors?',
    c_th: ['มวลเพียงอย่างเดียว', 'อัตราเร็วเพียงอย่างเดียว', 'มวลและอัตราเร็วของวัตถุ', 'มวลและความสูงจากพื้น', 'รูปร่างและพื้นที่ผิว'], c_en: ['Mass only', 'Speed only', 'Both mass and speed', 'Mass and height', 'Shape and surface area'], correct: 2,
    e_th: 'KE = ½mv² ขึ้นกับมวลและอัตราเร็ว', e_en: 'KE = ½mv² depends on mass and speed.' },
  { topic: 2, diff: 2, q_th: 'ลูกบอลมวล 2 kg เคลื่อนที่ด้วยอัตราเร็ว 3 m/s มีพลังงานจลน์เท่าใด', q_en: 'A 2 kg ball moves at 3 m/s. What is its kinetic energy?',
    c_th: ['3 J', '6 J', '9 J', '12 J', '18 J'], c_en: ['3 J', '6 J', '9 J', '12 J', '18 J'], correct: 2,
    e_th: 'KE = ½mv² = ½ × 2 × 3² = 9 J', e_en: 'KE = ½mv² = ½ × 2 × 3² = 9 J.' },
  { topic: 2, diff: 2, q_th: 'ยกกล่องมวล 5 kg ขึ้นในแนวดิ่งสูง 2 m (ใช้ g ≈ 10 m/s²) งานที่ทำโดยแรงที่ยกมีค่าเท่าใด', q_en: 'A 5 kg box is lifted vertically by 2 m (g ≈ 10 m/s²). How much work is done by the lifting force?',
    c_th: ['10 J', '25 J', '50 J', '100 J', '200 J'], c_en: ['10 J', '25 J', '50 J', '100 J', '200 J'], correct: 3,
    e_th: 'W = mgh = 5 × 10 × 2 = 100 J', e_en: 'W = mgh = 5 × 10 × 2 = 100 J.' },
  { topic: 2, diff: 3, q_th: 'รถยนต์วิ่งด้วยอัตราเร็ว v ใช้ระยะเบรก d จนหยุด ถ้าวิ่งด้วยอัตราเร็ว 2v โดยแรงเบรกเท่าเดิม ระยะเบรกจะเป็นเท่าใด', q_en: 'At speed v a car stops within braking distance d. At 2v with the same braking force, the distance becomes:',
    c_th: ['เท่าเดิม', 'เป็น 2 เท่า', 'เป็น √2 เท่า', 'เป็น 4 เท่า', 'เป็น 8 เท่า'], c_en: ['Unchanged', 'Twice as long', '√2 times longer', 'Four times longer', 'Eight times longer'], correct: 3,
    e_th: 'งานที่แรงเบรกทำ = พลังงานจลน์ที่สูญไป ⇒ Fd = ½mv² เมื่อ v เป็น 2 เท่า พลังงานจลน์เป็น 4 เท่า ระยะเบรกจึงเป็น 4 เท่า', e_en: 'Fd = ½mv². Doubling v quadruples KE, so the braking distance quadruples.' },
  { topic: 2, diff: 3, q_th: 'สปริงถูกบีบให้สั้นลงจากระยะ x เป็น 2x พลังงานศักย์ยืดหยุ่นของสปริงเปลี่ยนแปลงอย่างไร', q_en: 'A spring is compressed from x to 2x. How does its elastic potential energy change?',
    c_th: ['เท่าเดิม', 'เพิ่มขึ้นเป็น 2 เท่า', 'เพิ่มขึ้นเป็น 4 เท่า', 'ลดลงครึ่งหนึ่ง', 'ไม่เปลี่ยนแปลงเพราะ k คงที่'], c_en: ['Unchanged', 'Doubles', 'Quadruples', 'Halves', 'Unchanged because k is constant'], correct: 2,
    e_th: 'U = ½kx² เมื่อ x เป็น 2 เท่า U จะเป็น ½k(2x)² = 4 × ½kx²', e_en: 'U = ½kx²; replacing x with 2x gives ½k(2x)² = 4U.' },

  // ---- Topic 3: Heat ----
  { topic: 3, diff: 1, q_th: 'ความร้อนถ่ายเทเองโดยธรรมชาติจากข้อใดไปยังข้อใด', q_en: 'Heat naturally transfers from what to what?',
    c_th: ['วัตถุอุณหภูมิต่ำไปยังอุณหภูมิสูง', 'วัตถุอุณหภูมิสูงไปยังอุณหภูมิต่ำ', 'วัตถุมวลมากไปยังวัตถุมวลน้อย', 'วัตถุขนาดใหญ่ไปยังขนาดเล็ก', 'ทุกทิศทางเท่ากันเสมอ'], c_en: ['Cold object to hot object', 'Hot object to cold object', 'Heavier to lighter object', 'Larger to smaller object', 'Equally in all directions'], correct: 1,
    e_th: 'ความร้อนไหลจากอุณหภูมิสูงไปต่ำจนถึงสมดุลความร้อน', e_en: 'Heat flows from higher to lower temperature until thermal equilibrium.' },
  { topic: 3, diff: 1, q_th: 'อุณหภูมิ 27 °C เทียบเท่ากับกี่เคลวิน', q_en: 'A temperature of 27 °C equals how many kelvin?',
    c_th: ['246 K', '273 K', '290 K', '300 K', '310 K'], c_en: ['246 K', '273 K', '290 K', '300 K', '310 K'], correct: 3,
    e_th: 'T(K) = T(°C) + 273 = 27 + 273 = 300 K', e_en: 'T(K) = T(°C) + 273 = 300 K.' },
  { topic: 3, diff: 2, q_th: 'ลูกเหล็กผ่านห่วงเหล็กไม่ได้ แต่เมื่อให้ความร้อนกับห่วงแล้วลูกเหล็กผ่านได้ เพราะเหตุใด', q_en: 'A steel ball cannot pass through a metal ring, but after heating the ring the ball fits through. Why?',
    c_th: ['ห่วงหดตัวทำให้รูเล็กลง', 'ห่วงขยายตัวทำให้เส้นผ่านศูนย์กลางรูใหญ่ขึ้น', 'ลูกเหล็กหดตัวลง', 'ความร้อนทำให้ลูกเหล็กมวลลดลง', 'ความร้อนทำให้เกิดแรงเหนี่ยวนำ'], c_en: ['The ring contracts making the hole smaller', 'Thermal expansion enlarges the ring’s inner diameter', 'The ball shrinks', 'Heating reduces the ball’s mass', 'Heat induces a magnetic force'], correct: 1,
    e_th: 'โลหะให้ความร้อนแล้วขยายตัวทุกด้าน รวมถึงเส้นผ่านศูนย์กลางของรู จึงใหญ่ขึ้น', e_en: 'Metals expand in all dimensions when heated, including the hole diameter.' },
  { topic: 3, diff: 2, q_th: 'ค่าความร้อนจำเพาะ (specific heat capacity) ของสารหมายถึงข้อใด', q_en: 'What does the specific heat capacity of a substance mean?',
    c_th: ['ความร้อนที่ทำให้สารทั้งก้อนหลอมเหลว', 'อุณหภูมิสูงสุดที่สารทนได้', 'ความร้อนที่ทำให้สารมวล 1 kg มีอุณหภูมิสูงขึ้น 1 K', 'ความเร็วในการนำความร้อนของสาร', 'ปริมาณความร้อนต่อหน่วยพื้นที่ผิว'], c_en: ['Heat needed to melt the substance', 'Maximum temperature the substance withstands', 'Heat required to raise the temperature of 1 kg by 1 K', 'Speed of thermal conduction', 'Heat per unit surface area'], correct: 2,
    e_th: 'c คือปริมาณความร้อนต่อมวล 1 kg ที่ทำให้อุณหภูมิเพิ่ม 1 K (Q = mcΔT)', e_en: 'c is heat per kg per kelvin rise: Q = mcΔT.' },
  { topic: 3, diff: 3, q_th: 'น้ำมวล 2 kg ให้ความร้อนจาก 20 °C ถึง 70 °C (c ของน้ำ = 4200 J/(kg·K)) ต้องให้ความร้อนเท่าใด', q_en: 'Heating 2 kg of water from 20 °C to 70 °C (c = 4200 J/(kg·K)) requires how much heat?',
    c_th: ['84,000 J', '168,000 J', '294,000 J', '420,000 J', '840,000 J'], c_en: ['84,000 J', '168,000 J', '294,000 J', '420,000 J', '840,000 J'], correct: 3,
    e_th: 'Q = mcΔT = 2 × 4200 × 50 = 420,000 J', e_en: 'Q = mcΔT = 2 × 4200 × 50 = 420,000 J.' },
  { topic: 3, diff: 3, q_th: 'เหตุใดโลหะจึงนำความร้อนได้ดีกว่าไม้', q_en: 'Why do metals conduct heat better than wood?',
    c_th: ['เพราะโลหะมีความหนาแน่นมากกว่า', 'เพราะโลหะมีอิเล็กตรอนอิสระช่วยถ่ายเทพลังงาน', 'เพราะไม้มีอุณหภูมิต่ำกว่า', 'เพราะโลหะมีพื้นที่ผิวมากกว่า', 'เพราะไม้ดูดซับความร้อนไว้ในรูพรุณ'], c_en: ['Metals are denser', 'Free electrons transfer energy quickly', 'Wood has lower temperature', 'Metals have larger surface area', 'Wood absorbs heat into pores'], correct: 1,
    e_th: 'อิเล็กตรอนอิสระในโลหะเคลื่อนที่ถ่ายเทพลังงานจลน์ได้เร็ว จึงนำความร้อนดี', e_en: 'Free electrons in metals transport kinetic energy rapidly, giving high conductivity.' },

  // ---- Topic 4: Waves & Sound ----
  { topic: 4, diff: 1, q_th: 'เสียงเดินทางจากดวงอาทิตย์มายังโลกได้หรือไม่ เพราะเหตุใด', q_en: 'Can sound travel from the Sun to the Earth? Why?',
    c_th: ['ได้ เพราะแสงและเสียงเดินทางเหมือนกัน', 'ได้ เพราะอวกาศมีอากาศบาง ๆ', 'ไม่ได้ เพราะอวกาศเป็นสุญญากาศ เสียงต้องอาศัยตัวกลาง', 'ไม่ได้ เพราะเสียงมีความเร็วต่ำเกินไป', 'ได้ แต่ใช้เวลานานมาก'], c_en: ['Yes, sound travels like light', 'Yes, space has thin air', 'No, space is a vacuum and sound needs a medium', 'No, sound is too slow', 'Yes, but it takes very long'], correct: 2,
    e_th: 'เสียงเป็นคลื่นเชิงกลต้องมีตัวกลาง อวกาศเป็นสุญญากาศจึงเดินทางไม่ได้', e_en: 'Sound is a mechanical wave requiring a medium; vacuum blocks it.' },
  { topic: 4, diff: 1, q_th: 'ลูกตุ้มแกว่งครบหนึ่งรอบใช้เวลา 0.5 s ความถี่การแกว่งเป็นกี่เฮิรตซ์', q_en: 'A pendulum completes one cycle in 0.5 s. What is its frequency?',
    c_th: ['0.5 Hz', '1 Hz', '1.5 Hz', '2 Hz', '4 Hz'], c_en: ['0.5 Hz', '1 Hz', '1.5 Hz', '2 Hz', '4 Hz'], correct: 3,
    e_th: 'f = 1/T = 1/0.5 = 2 Hz', e_en: 'f = 1/T = 2 Hz.' },
  { topic: 4, diff: 2, q_th: 'คลื่นหนึ่งมีความถี่ 50 Hz และความยาวคลื่น 4 m อัตราเร็วการเคลื่อนที่ของคลื่นเป็นเท่าใด', q_en: 'A wave has frequency 50 Hz and wavelength 4 m. What is its wave speed?',
    c_th: ['12.5 m/s', '54 m/s', '150 m/s', '200 m/s', '450 m/s'], c_en: ['12.5 m/s', '54 m/s', '150 m/s', '200 m/s', '450 m/s'], correct: 3,
    e_th: 'v = fλ = 50 × 4 = 200 m/s', e_en: 'v = fλ = 50 × 4 = 200 m/s.' },
  { topic: 4, diff: 2, q_th: 'ข้อใดจับคู่คุณลักษณะของเสียงกับปัจจัยที่กำหนดได้ถูกต้อง', q_en: 'Which pairing of sound properties with their determining factors is correct?',
    c_th: ['ความดัง–ความถี่, ระดับเสียง–แอมพลิจูด', 'ความดัง–แอมพลิจูด, ระดับเสียง–ความถี่', 'ความดัง–ความเร็ว, ระดับเสียง–ความยาวคลื่น', 'ความกังวาน–มวลตัวกลาง, ความดัง–ความยาวคลื่น', 'ระดับเสียง–แรงเบรก? ไม่มีข้อถูก'], c_en: ['Loudness–frequency, pitch–amplitude', 'Loudness–amplitude, pitch–frequency', 'Loudness–speed, pitch–wavelength', 'Timbre–medium mass, loudness–wavelength', 'None are correct'], correct: 1,
    e_th: 'ความดังขึ้นกับแอมพลิจูด ระดับเสียง (สูง–ต่ำ) ขึ้นกับความถี่', e_en: 'Loudness depends on amplitude; pitch on frequency.' },
  { topic: 4, diff: 3, q_th: 'รถฉุกเฉินบีบไซเรนวิ่งเข้าหาเรา เสียงที่เราได้ยินมีความถี่เป็นอย่างไร (ปรากฏการณ์ดอปเปลอร์)', q_en: 'An ambulance sounding its siren approaches you. According to the Doppler effect, the frequency you hear is:',
    c_th: ['ต่ำกว่าเสียงจริง', 'สูงกว่าเสียงจริง', 'เท่ากับเสียงจริงเสมอ', 'เป็นศูนย์ขณะเคลื่อนที่', 'สูงขึ้นเฉพาะตอนจอด'], c_en: ['Lower than the source frequency', 'Higher than the source frequency', 'Always equal to the source frequency', 'Zero while moving', 'Higher only when stopped'], correct: 1,
    e_th: 'เมื่อแหล่งกำเนิดเคลื่อนเข้าหา คลื่นถูกบีบให้แน่นขึ้น ความถี่ที่ได้ยินจึงสูงขึ้น', e_en: 'Approaching sources compress wavefronts, raising the observed frequency.' },
  { topic: 4, diff: 3, q_th: 'คลื่นสองลูกแทรกสอดกันเชิงบวกที่จุดหนึ่ง เมื่อผลต่างเส้นทางจากแหล่งกำเนิดทั้งสองมีค่าเป็นอย่างไร', q_en: 'Two waves interfere constructively at a point when the path difference from the two sources equals:',
    c_th: ['ครึ่งหนึ่งของความยาวคลื่น', 'จำนวนเต็มของความยาวคลื่น λ', 'หนึ่งในสี่ของความยาวคลื่น', 'สองเท่าของแอมพลิจูด', 'ค่าใด ๆ ก็ได้'], c_en: ['Half a wavelength', 'An integer multiple of the wavelength λ', 'A quarter wavelength', 'Twice the amplitude', 'Any value'], correct: 1,
    e_th: 'การแทรกสอดเชิงบวกเกิดเมื่อผลต่างเส้นทาง = nλ (n = 0, 1, 2, ...)', e_en: 'Constructive interference occurs at path differences of nλ (n = 0, 1, 2, ...).' },

  // ---- Topic 5: Light & Optics ----
  { topic: 5, diff: 1, q_th: 'แสงเดินทางได้เร็วที่สุดในตัวกลางใด', q_en: 'In which medium does light travel fastest?',
    c_th: ['น้ำ', 'กระจก', 'เพชร', 'สุญญากาศ', 'น้ำมัน'], c_en: ['Water', 'Glass', 'Diamond', 'Vacuum', 'Oil'], correct: 3,
    e_th: 'แสงเร็วที่สุดในสุญญากาศ ประมาณ 3×10⁸ m/s และช้าลงเมื่อเข้าตัวกลางอื่น', e_en: 'Light is fastest in vacuum (~3×10⁸ m/s) and slower in any material medium.' },
  { topic: 5, diff: 1, q_th: 'ภาพที่เกิดขึ้นจากกระจกเงาราบมีลักษณะอย่างไร', q_en: 'What kind of image does a plane mirror form?',
    c_th: ['ภาพจริง กลับหัว เล็กกว่าวัตถุ', 'ภาพสมมูล ตรง ขนาดเท่าวัตถุ', 'ภาพจริง ตรง ใหญ่กว่าวัตถุ', 'ภาพสมมูล กลับหัว ขนาดเท่าวัตถุ', 'ไม่เกิดภาพเลย'], c_en: ['Real, inverted, smaller', 'Virtual, upright, same size', 'Real, upright, larger', 'Virtual, inverted, same size', 'No image forms'], correct: 1,
    e_th: 'กระจกราบให้ภาพสมมูล ตรง ขนาดเท่าวัตถุ และซ้าย-ขวาสลับ', e_en: 'A plane mirror gives a virtual, upright, same-size image with left-right reversal.' },
  { topic: 5, diff: 2, q_th: 'แสงเคลื่อนที่จากอากาศเข้าสู่น้ำ จะเกิดปรากฏการณ์ใดขึ้น', q_en: 'When light passes from air into water, what happens?',
    c_th: ['หักเหออกจากเส้นปกติ เพราะความเร็วเพิ่มขึ้น', 'หักเหเข้าหาเส้นปกติ เพราะความเร็วลดลง', 'สะท้อนกลับหมดทุกครั้ง', 'ไม่เปลี่ยนทิศทางเลย', 'ความถี่ของแสงลดลง'], c_en: ['Bends away from normal because speed increases', 'Bends toward the normal because speed decreases', 'Totally internally reflects every time', 'Direction unchanged', 'Frequency decreases'], correct: 1,
    e_th: 'แสงลงจากตัวกลางโปร่ง (อากาศ) สู่แน่นกว่า (น้ำ) ความเร็วลด รังสีหักเหเข้าหาเส้นปกติ', e_en: 'Entering an optically denser medium slows light, bending it toward the normal.' },
  { topic: 5, diff: 2, q_th: 'เลนส์นูน (converging lens) มีสมบัติใด', q_en: 'What property does a converging (convex) lens have?',
    c_th: ['กระจายลำแสงขนานแกนหลักออกจากกัน', 'รวมลำแสงขนานแกนหลักไปยังจุดโฟกัส', 'ไม่ทำให้ลำแสงเบี่ยงเบน', 'ดูดกลืนแสงทั้งหมด', 'หมุนทิศแสง 180°'], c_en: ['Diverges parallel rays', 'Converges parallel rays to the focal point', 'Does not bend light', 'Absorbs all light', 'Rotates light by 180°'], correct: 1,
    e_th: 'เลนส์นูนรวมลำแสงขนานแกนหลักที่จุดโฟกัสจริงด้านหลังเลนส์', e_en: 'A convex lens brings parallel rays to a real focus behind the lens.' },
  { topic: 5, diff: 3, q_th: 'การสะท้อนกลับหมด (total internal reflection) เกิดขึ้นได้เมื่อใด', q_en: 'When does total internal reflection occur?',
    c_th: ['แสงจากตัวกลางโปร่งกว่าเข้าตัวกลางแน่นกว่า ทุกมุม', 'แสงจากตัวกลางแน่นกว่าไปตัวกลางโปร่งกว่า โดยมุมตกกระทบมากกว่ามุมวิกฤต', 'แสงตกกระทบตั้งฉากกับผิวเสมอ', 'เมื่อความถี่แสงสูงมาก', 'เมื่อแหล่งกำเนิดมีกำลังสูง'], c_en: ['From less dense to denser medium at any angle', 'From denser to less dense medium with incidence angle beyond critical angle', 'Only at perpendicular incidence', 'Only for very high frequency', 'Only with powerful sources'], correct: 1,
    e_th: 'ต้องเป็นการเดินทางจากตัวกลางที่หักเหมากว่าไปยังตัวกลางที่หักเหน้อยกว่า และมุมตกกระทบ > มุมวิกฤต', e_en: 'Requires travel from higher to lower refractive index with angle of incidence above the critical angle.' },
  { topic: 5, diff: 3, q_th: 'เงาส่วนที่มืดสนิท (umbra) เกิดขึ้นได้เพราะเหตุใด', q_en: 'Why does the fully dark part of a shadow (umbra) form?',
    c_th: ['เพราะแสงหักเหวนรอบวัตถุ', 'เพราะแสงเดินทางเป็นเส้นตรงและถูกวัตถุกีดกันจนแสงจากแหล่งกำเนิดถึงจุดนั้นทั้งหมด', 'เพราะวัตถุดูดกลืนแสงบางส่วน', 'เพราะแสงสะท้อนจากพื้น', 'เพราะแสงมีความยาวคลื่นสั้น'], c_en: ['Light diffracts around the object', 'Light travels in straight lines and the object blocks all light from the source', 'The object partially absorbs light', 'Light reflects off the floor', 'Light has short wavelength'], correct: 1,
    e_th: 'การเดินทางเป็นเส้นตรงของแสงทำให้เขตที่ถูกกีดกันทั้งหมดเป็นเงามืดสนิท', e_en: 'Straight-line propagation means regions fully blocked by the object receive no light.' },

  // ---- Topic 6: Electricity & Magnetism ----
  { topic: 6, diff: 1, q_th: 'ประจุไฟฟ้าสองประจุชนิดเดียวกัน (ทั้งคู่บวก หรือทั้งคู่ลบ) เมื่อนำมาใกล้กันจะเกิดอะไรขึ้น', q_en: 'What happens when two like charges (both positive or both negative) are brought near each other?',
    c_th: ['ดึงดูดกัน', 'ผลักกัน', 'ไม่เกิดแรงใด ๆ', 'เป็นกลางทางไฟฟ้า', 'รวมตัวเป็นประจุใหญ่ขึ้นเสมอ'], c_en: ['They attract', 'They repel', 'No force occurs', 'They become neutral', 'They always merge'], correct: 1,
    e_th: 'ประจุชนิดเดียวกันผลักกัน ประจุต่างชนิดดึงดูดกัน', e_en: 'Like charges repel; opposite charges attract.' },
  { topic: 6, diff: 1, q_th: 'เครื่องมือวัดกระแสไฟฟ้าคือข้อใด และควรต่อในวงจรอย่างไร', q_en: 'Which instrument measures electric current, and how should it be connected?',
    c_th: ['โวลต์มิเตอร์ ต่ออนุกรม', 'โวลต์มิเตอร์ ต่อขนาน', 'แอมมิเตอร์ ต่ออนุกรม', 'แอมมิเตอร์ ต่อขนาน', 'โอห์มมิเตอร์ ต่อขนานขณะมีไฟ'], c_en: ['Voltmeter in series', 'Voltmeter in parallel', 'Ammeter in series', 'Ammeter in parallel', 'Ohmmeter in parallel while powered'], correct: 2,
    e_th: 'แอมมิเตอร์วัดกระแส หน่วยแอมแปร์ ต่ออนุกรมเพื่อให้กระแสไหลผ่าน ส่วนโวลต์มิเตอร์ต่อขนาน', e_en: 'An ammeter (unit: ampere) goes in series; voltmeters go in parallel.' },
  { topic: 6, diff: 2, q_th: 'ตามกฎของโอห์ม ถ้าความต่างศักย์ V = 12 V ต่อคู่ขนานกับตัวต้านทาน R = 4 Ω กระแสไฟฟ้ามีค่าเท่าใด', q_en: 'By Ohm’s law, if V = 12 V across R = 4 Ω, what is the current?',
    c_th: ['0.33 A', '3 A', '8 A', '16 A', '48 A'], c_en: ['0.33 A', '3 A', '8 A', '16 A', '48 A'], correct: 1,
    e_th: 'I = V/R = 12/4 = 3 A', e_en: 'I = V/R = 12/4 = 3 A.' },
  { topic: 6, diff: 2, q_th: 'ตัวต้านทาน 2 Ω ต่ออนุกรมกับ 3 Ω ค่าความต้านทานรวมของวงจรเป็นเท่าใด', q_en: 'A 2 Ω resistor is connected in series with a 3 Ω resistor. What is the total resistance?',
    c_th: ['1 Ω', '1.2 Ω', '2.5 Ω', '5 Ω', '6 Ω'], c_en: ['1 Ω', '1.2 Ω', '2.5 Ω', '5 Ω', '6 Ω'], correct: 3,
    e_th: 'การต่ออนุกรม Rรวม = R₁ + R₂ = 2 + 3 = 5 Ω', e_en: 'Series: R = R₁ + R₂ = 5 Ω.' },
  { topic: 6, diff: 3, q_th: 'ตัวต้านทาน 6 Ω ต่อขนานกับ 3 Ω ค่าความต้านทานรวมเป็นเท่าใด', q_en: 'A 6 Ω resistor is connected in parallel with a 3 Ω resistor. What is the equivalent resistance?',
    c_th: ['1 Ω', '2 Ω', '4.5 Ω', '9 Ω', '18 Ω'], c_en: ['1 Ω', '2 Ω', '4.5 Ω', '9 Ω', '18 Ω'], correct: 1,
    e_th: '1/R = 1/6 + 1/3 = 3/6 ⇒ R = 2 Ω', e_en: '1/R = 1/6 + 1/3 = 1/2 ⇒ R = 2 Ω.' },
  { topic: 6, diff: 3, q_th: 'เตารีดต่อกับแหล่งจ่าย 220 V และดึงกระแส 0.5 A กำลังไฟฟ้าที่ใช้เป็นเท่าใด', q_en: 'An iron draws 0.5 A from a 220 V supply. What power does it use?',
    c_th: ['55 W', '110 W', '220 W', '440 W', '1100 W'], c_en: ['55 W', '110 W', '220 W', '440 W', '1100 W'], correct: 1,
    e_th: 'P = VI = 220 × 0.5 = 110 W', e_en: 'P = VI = 110 W.' },
];

const PAST_EXAM_ITEM_IDS = [1, 3, 7, 9, 11, 14, 17, 21, 25, 27];
const WRONG_COUNTS = { student1: 1, student2: 3, student3: 6 };

// Seed content is written via `t` (tx api locally, the global handle remotely).
// Remote mode runs standalone batches on fresh streams each time: Turso caps
// requests per stream very low, so one long transaction cannot be used there.
// Idempotency comes from a cleanup pass before inserting.
async function cleanupPartialSeed(t) {
  await t.run(`DELETE FROM meta WHERE key = 'seeded'`);
  await t.batch([
    { sql: 'DELETE FROM attempts', args: [] },
    { sql: 'DELETE FROM exam_items', args: [] },
    { sql: 'DELETE FROM exams', args: [] },
    { sql: 'DELETE FROM sessions', args: [] },
    { sql: "DELETE FROM users WHERE username IN ('admin','student1','student2','student3')", args: [] },
    { sql: 'DELETE FROM items', args: [] },
    { sql: 'DELETE FROM topics', args: [] },
  ]);
}

async function seedInto(t) {
    // Topics: one batch.
    let pos = 1;
    await t.batch(TOPICS.map(([th, en]) => ({
      sql: 'INSERT INTO topics (name_th, name_en, position) VALUES (?, ?, ?)',
      args: [th, en, pos++],
    })));

    // Items: one batch.
    const ts = nowIso();
    await t.batch(ITEMS.map((it) => ({
      sql: `INSERT INTO items (topic_id, difficulty, question_th, question_en, choices_th, choices_en,
             correct_index, explanation_th, explanation_en, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [it.topic, it.diff, it.q_th, it.q_en, JSON.stringify(it.c_th), JSON.stringify(it.c_en),
        it.correct, it.e_th, it.e_en, ts, ts],
    })));
    // Users: batch insert, then fetch ids in one query.
    const mkSalt = require('./auth').makeSalt;
    const userRows = [
      ['admin', 'Admin@1234', 'admin', 'ผู้ดูแล', 'ระบบ', 'คณะวิทยาศาสตร์และเทคโนโลยี'],
      ['student1', 'Student@1234', 'student', 'สมชาย', 'ใจดี', 'ฟิสิกส์ ปี 2'],
      ['student2', 'Student@1234', 'student', 'สมหญิง', 'เรียนเก่ง', 'ฟิสิกส์ ปี 2'],
      ['student3', 'Student@1234', 'student', 'อนันต์', 'ขยันมาก', 'ฟิสิกส์ ปี 1'],
    ].map(([username, password, role, firstName, lastName, org]) => {
      const salt = mkSalt();
      return { username,
        sql: `INSERT INTO users (username, pass_hash, salt, role, first_name, last_name, org, email, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, '', 'active', ?)`,
        args: [username, hashPassword(password, salt), salt, role, firstName, lastName, org, nowIso()] };
    });
    await t.batch(userRows.map(({ sql, args }) => ({ sql, args })));
    const idRows = await t.all(
      `SELECT id, username FROM users WHERE username IN ('admin','student1','student2','student3')`);
    const uidByName = new Map(idRows.map((r) => [r.username, r.id]));
    const s1 = uidByName.get('student1');
    const s2 = uidByName.get('student2');
    const s3 = uidByName.get('student3');

    // Past (closed) exam with graded attempts so reports/charts have data.
    const pastExamRow = await t.get(
      `INSERT INTO exams (title_th, title_en, description, duration_min, open_at, close_at, shuffle, published, blueprint, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, NULL, ?)
       RETURNING id`,
      'สอบเก็บคะแนนกลางภาค ฟิสิกส์', 'Physics Midterm Quiz',
      'ข้อสอบย้อนหลังสำหรับสาธิตรายงานผล (ปิดรับสอบแล้ว)',
      20, iso(-30), iso(-28),
      JSON.stringify({ 1: { 1: 1, 2: 1 }, 2: { 1: 1, 2: 1, 3: 1 }, 3: { 1: 1, 3: 1 }, 4: { 2: 1 }, 5: { 1: 1, 2: 1 } }),
      nowIso()
    );
    const pastExamId = Number(pastExamRow.id);
    await buildExamItems(t, pastExamId, PAST_EXAM_ITEM_IDS, false);

    const pastItems = await t.all(
      `SELECT i.id, i.correct_index FROM exam_items ei JOIN items i ON i.id = ei.item_id
       WHERE ei.exam_id = ? ORDER BY ei.position`, pastExamId);

    const submittedBase = Date.now() - 29 * 86400000;
    let ai = 0;
    const attemptStmts = [];
    for (const [uid, uname] of [[s1, 'student1'], [s2, 'student2'], [s3, 'student3']]) {
      let wrongLeft = WRONG_COUNTS[uname];
      const answers = {};
      for (const row of pastItems) {
        answers[row.id] = wrongLeft-- > 0 ? (row.correct_index + 1 + ai) % 5 : row.correct_index;
      }
      const score = pastItems.length - WRONG_COUNTS[uname];
      const started = new Date(submittedBase - 15 * 60000).toISOString();
      const submitted = new Date(submittedBase + ai * 120000).toISOString();
      attemptStmts.push({
        sql: `INSERT INTO attempts (exam_id, user_id, started_at, deadline_at, submitted_at, answers, flagged, status, score)
              VALUES (?, ?, ?, ?, ?, ?, '[]', 'submitted', ?)`,
        args: [pastExamId, uid, started, new Date(submittedBase).toISOString(), submitted, JSON.stringify(answers), score],
      });
      ai += 1;
    }
    await t.batch(attemptStmts);

    // Open practice exam available right now.
    const { picked } = await sampleByBlueprint({ 1: { 1: 1, 2: 1 }, 2: { 1: 1, 2: 1 }, 3: { 1: 1, 2: 1 }, 4: { 1: 1, 2: 1 }, 5: { 1: 1, 2: 1 }, 6: { 1: 1, 2: 1 } }, t);
    const demoRow = await t.get(
      `INSERT INTO exams (title_th, title_en, description, duration_min, open_at, close_at, shuffle, published, blueprint, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, NULL, ?)
       RETURNING id`,
      'ชุดฝึก CBT ฟิสิกส์ (สาธิต)', 'Physics CBT Practice (Demo)',
      'แบบทดสอบ 5 ตัวเลือก 12 ข้อ เปิดให้ทำได้ทันที',
      20, iso(0, -1), iso(30),
      JSON.stringify({ 1: { 1: 1, 2: 1 }, 2: { 1: 1, 2: 1 }, 3: { 1: 1, 2: 1 }, 4: { 1: 1, 2: 1 }, 5: { 1: 1, 2: 1 }, 6: { 1: 1, 2: 1 } }),
      nowIso()
    );
    const demoId = Number(demoRow.id);
    await buildExamItems(t, demoId, picked, true);

    await audit(null, 'seed', 'database seeded');
    await t.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', ?)`, nowIso());
}

async function ensureSeeded() {
  await ensureSchema();
  const seeded = await q.get(`SELECT value FROM meta WHERE key = 'seeded'`);
  if (seeded) return;

  if (!isRemote) {
    await tx(async (t) => {
      await cleanupPartialSeed(t);
      await seedInto(t);
    });
  } else {
    // Remote: standalone batches on fresh streams (Turso caps requests per stream).
    await cleanupPartialSeed(q);
    await seedInto(q);
  }
}

module.exports = { ensureSeeded };
