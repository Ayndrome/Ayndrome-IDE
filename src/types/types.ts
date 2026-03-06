import { Id } from "../../convex/_generated/dataModel";

export interface Project {
    _id: Id<"projects">;
    _creationTime: number;
    name: string;
    userId: string;
    updatedAt?: number;
    importStatus?: "processing" | "completed" | "failed";
    exportStatus?: "processing" | "completed" | "failed";
    exportUrl?: string;
}