export type Program = {
  id?: string;
  courseName: string;
  level: "Bachelors" | "Masters";
  university: string;
  city: string;
  country: string;
  tuitionBDT: number;
  about: string;
  createdAt?: any;
};
