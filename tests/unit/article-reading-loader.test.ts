import { beforeEach, describe, expect, it, vi } from "vitest";
const { getPost, getArchive } = vi.hoisted(() => ({getPost:vi.fn(), getArchive:vi.fn()}));
vi.mock("@/lib/blog-public.server", () => ({getBlogBySlug:getPost, getPublishedBlogs:getArchive}));
vi.mock("@/components/Navbar", () => ({default:()=>null}));
vi.mock("@/components/Footer", () => ({default:()=>null}));
import { loader } from "@/routes/blog.$slug";
function request(slug = "reading") {
  const url = new URL(`http://localhost/blog/${slug}`);
  return {request:new Request(url),url,pattern:"/blog/:slug",params:{slug},context:{}};
}
describe("article availability", () => {
  beforeEach(() => { getPost.mockReset(); getArchive.mockReset(); });
  it("keeps an available article readable when recommendations fail", async () => {
    const post = {id:"story",title:"Reading",slug:"reading",content:"<p>Story</p>"};
    getPost.mockResolvedValue(post); getArchive.mockRejectedValue(new Error("Archive offline"));
    expect(await loader(request())).toEqual({post,related:[]});
  });
  it("retains a missing article's 404 even if recommendations fail", async () => {
    getPost.mockResolvedValue(null); getArchive.mockRejectedValue(new Error("Archive offline"));
    await expect(loader(request())).rejects.toMatchObject({status:404});
  });
  it("propagates failure of the primary article read", async () => {
    const error = new Response("Article unavailable",{status:503});
    getPost.mockRejectedValue(error); getArchive.mockResolvedValue([]);
    await expect(loader(request())).rejects.toBe(error);
  });
  it("keeps recommendations unique and excludes the current article", async () => {
    const post = {id:"story",title:"Reading",slug:"reading",topicLabel:"Technical"};
    const recommended = {id:"next",title:"Next",slug:"next",topicLabel:"Technical"};
    getPost.mockResolvedValue(post); getArchive.mockResolvedValue([post,recommended,recommended]);
    expect((await loader(request())).related).toEqual([recommended]);
  });
});
