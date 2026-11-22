import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getProfile, saveProfile } from "@/server/workspace/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getProfile(user.id));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(await saveProfile(user.id, await readJson(request)));
	} catch (error) {
		return toErrorResponse(error);
	}
}
