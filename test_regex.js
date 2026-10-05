let s = "СТАТОРЕН ПАК. ВАР. 25";
s = s.toLowerCase();
let r = s.replace(/[^a-zа-я0-9]/g, '');
console.log(r);
