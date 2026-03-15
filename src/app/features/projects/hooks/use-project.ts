import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

export const useProjectsPartial = (limit: number) => {
    const projects = useQuery(api.project.getPartial, { limit });
    return projects;
};


export const useProjects = () => {
    const projects = useQuery(api.project.get);
    return projects;
};


export const useCreateProject = () => {
    const mutation = useMutation(api.project.create);
    return mutation;
}

export const useProject = (id: Id<"projects">) => {
    const project = useQuery(api.project.getById, { id });
    return project;
};