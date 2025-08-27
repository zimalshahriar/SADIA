export type Program = {
  id?: string;
  courseName: string;
  level: "Bachelors" | "Masters";
  university: string;
  city: string;
  country: string;
  tuitionBDT: number;
  about: string;
  discipline: "Agriculture & Forestry" |
    "Applied Sciences & Professions" |
    "Arts, Design & Architecture" |
    "Business & Management" |
    "Computer Science & IT" |
    "Education & Training" |
    "Engineering & Technology" |
    "Environmental Studies & Earth Sciences" |
    "Hospitality, Leisure & Sports" |
    "Humanities" |
    "Journalism & Media" |
    "Law" |
    "Medicine & Health" |
    "Natural Sciences & Mathematics" |
    "Social Sciences";
  createdAt?: any;
};
