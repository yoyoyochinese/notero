// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { findIds, makeCitekey, parseArxiv, parseCrossref } from "./metadata";

test("findIds: DOIs", () => {
  expect(findIds("Published as doi:10.1038/nature14539.")).toEqual({ doi: "10.1038/nature14539" });
  expect(findIds("see https://doi.org/10.1145/3292500.3330701, and more")).toEqual({ doi: "10.1145/3292500.3330701" });
  expect(findIds("(DOI 10.1002/(SICI)1097-0258(19980815)17:15<1661::AID-SIM968>3.0.CO;2-2)")).toEqual({
    doi: "10.1002/(SICI)1097-0258(19980815)17:15",
  });
  expect(findIds("(https://doi.org/10.1000/abc(1)2)")).toEqual({ doi: "10.1000/abc(1)2" });
  expect(findIds("no identifiers here")).toEqual({});
});

test("findIds: arXiv IDs", () => {
  expect(findIds("arXiv:2401.01234v2 [cs.CL] 3 Jan 2024")).toEqual({ arxiv: "2401.01234" });
  expect(findIds("arXiv: 1706.03762")).toEqual({ arxiv: "1706.03762" });
  expect(findIds("https://arxiv.org/abs/1706.03762v5")).toEqual({ arxiv: "1706.03762" });
  expect(findIds("arXiv:hep-th/9901001v1 4 Jan 1999")).toEqual({ arxiv: "hep-th/9901001" });
  expect(findIds("preprint math.AG/0309136")).toEqual({ arxiv: "math.AG/0309136" });
  expect(findIds("https://doi.org/10.48550/arXiv.2401.01234.")).toEqual({ arxiv: "2401.01234" });
  expect(findIds("arXiv:2401.01234 doi:10.1038/nature14539")).toEqual({ arxiv: "2401.01234", doi: "10.1038/nature14539" });
});

test("parseCrossref", () => {
  const json = {
    status: "ok",
    message: {
      DOI: "10.1038/nature14539",
      title: ["Deep <i>learning</i>"],
      author: [
        { given: "Yann", family: "LeCun", sequence: "first" },
        { given: "Yoshua", family: "Bengio" },
        { name: "The Consortium" },
      ],
      issued: { "date-parts": [[2015, 5, 27]] },
      "container-title": ["Nature"],
    },
  };
  expect(parseCrossref(json)).toEqual({
    title: "Deep learning",
    authors: [
      { family: "LeCun", given: "Yann" },
      { family: "Bengio", given: "Yoshua" },
      { family: "The Consortium" },
    ],
    year: 2015,
    venue: "Nature",
    doi: "10.1038/nature14539",
  });
  expect(parseCrossref({ message: { title: ["X"], issued: { "date-parts": [[null]] } } })).toEqual({
    title: "X",
    authors: [],
    year: undefined,
    venue: undefined,
    doi: undefined,
  });
});

const atom = (entry: string) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title>arXiv Query: id_list=1706.03762</title>
  ${entry}
</feed>`;

test("parseArxiv", () => {
  const xml = atom(`<entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
      You Need</title>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <author><name>Łukasz Kaiser</name></author>
    <arxiv:doi>10.5555/3295222</arxiv:doi>
    <arxiv:journal_ref>NeurIPS 2017 &amp; more</arxiv:journal_ref>
  </entry>`);
  expect(parseArxiv(xml)).toEqual({
    title: "Attention Is All You Need",
    authors: [
      { family: "Vaswani", given: "Ashish" },
      { family: "Shazeer", given: "Noam" },
      { family: "Kaiser", given: "Łukasz" },
    ],
    year: 2017,
    venue: "NeurIPS 2017 & more",
    doi: "10.5555/3295222",
    arxiv: "1706.03762",
  });

  const old = parseArxiv(atom(`<entry><id>http://arxiv.org/abs/hep-th/9901001v1</id><published>1999-01-04T00:00:00Z</published>
    <title>T</title><author><name>Plato</name></author></entry>`));
  expect(old).toMatchObject({ arxiv: "hep-th/9901001", venue: "arXiv", doi: undefined, authors: [{ family: "Plato" }] });

  // Unknown IDs come back as an error entry.
  expect(parseArxiv(atom(`<entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_1234</id><title>Error</title></entry>`))).toBe(null);
  expect(parseArxiv(atom(""))).toBe(null);
});

test("makeCitekey", () => {
  const none = new Set<string>();
  const vaswani = { title: "Attention Is All You Need", authors: [{ family: "Vaswani" }], year: 2017 };
  expect(makeCitekey(vaswani, "x.pdf", none)).toBe("vaswani2017attention");
  expect(makeCitekey({ title: "On the Theory of Everything", authors: [{ family: "Müller" }], year: 2020 }, "x.pdf", none)).toBe(
    "muller2020theory",
  );
  expect(makeCitekey({ title: "The Art", authors: [{ family: "O'Brien-Smith" }] }, "x.pdf", none)).toBe("obriensmithart");
  expect(makeCitekey({ title: "Some Title", authors: [] }, "My Paper (final).PDF", none)).toBe("mypaperfinal");
  expect(makeCitekey({ title: "Some Title", authors: [] }, "论文.pdf", none)).toBe("paper");
  expect(makeCitekey(vaswani, "x.pdf", new Set(["vaswani2017attention"]))).toBe("vaswani2017attentiona");
  expect(makeCitekey(vaswani, "x.pdf", new Set(["vaswani2017attention", "vaswani2017attentiona"]))).toBe("vaswani2017attentionb");
});
