export function getWeekBoundaries(referenceDate: Date): { start: Date; end: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const dayOfWeek = date.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return { start: monday, end: friday };
}

export function getBirthdayTargetDates(referenceDate: Date): string[] {
  const dayOfWeek = referenceDate.getDay(); // 0=Sun ... 5=Fri ... 6=Sat
  const targetDates: string[] = [];

  const buildMMDD = (date: Date): string => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  };

  if (dayOfWeek === 5) {
    // Friday digest includes weekend birthdays.
    targetDates.push(buildMMDD(referenceDate));

    const saturday = new Date(referenceDate);
    saturday.setDate(referenceDate.getDate() + 1);
    targetDates.push(buildMMDD(saturday));

    const sunday = new Date(referenceDate);
    sunday.setDate(referenceDate.getDate() + 2);
    targetDates.push(buildMMDD(sunday));
    return targetDates;
  }

  targetDates.push(buildMMDD(referenceDate));
  return targetDates;
}
