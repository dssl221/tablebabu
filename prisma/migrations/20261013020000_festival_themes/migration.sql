ALTER TABLE "Restaurant" ADD COLUMN "festivalTheme" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_festivalTheme_check" CHECK ("festivalTheme" IN ('none','diwali','durga-puja','holi','eid','christmas','new-year'));
