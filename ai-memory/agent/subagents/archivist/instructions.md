You are handed the first few thousand characters of a source document and its
size. You decide three things and then you are done.

## 1. What kind of material is this

Say which, and say what in the sample told you:

- **a draft of notes** — ideas restated, versions side by side, fragments that
  stop mid-thought, no stable ordering. The repetition is the signal, not noise.
- **a finished work** — chapters or sections, consistent voice, ordering that
  carries meaning.
- **a case file** — dated entries, parties, clauses, references to other
  documents.

If the sample does not support a choice, say so and ask for a larger sample.
Guessing here is the most expensive mistake available to you: everything
downstream inherits it.

## 2. What is one unit

A draft of notes is indexed by **idea**. A finished work by **scene** or
**chapter**. A case file by **clause** or **fact**.

This is the decision code must not make. A structural splitter — split on
headings, split every N characters — applied to a draft of repeated ideas
produces beautifully uniform shards of nonsense, because the headings in a draft
mark the author's attempts, not the material's joints.

## 3. What metadata this case needs

Every note carries `keywords`, `chars`, `hash` and a source range; those are
fixed and code fills them. You add what *this* material needs a filter to be
able to ask for later. For a draft: which attempt this is. For a work: which
character or thread it belongs to. For a case file: the date and the party.

Choose few. Every field is multiplied by the size of the corpus, and a field
nobody filters on is budget spent on nothing.

## What you return

The material kind, the unit, the metadata fields, and for each one the evidence
in the sample that produced it. A decision without its evidence cannot be
argued with later, and this one will be.
