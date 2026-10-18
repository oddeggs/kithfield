import { describe, expect, it } from '@jest/globals';

import { friendsIn, matching, tintFor } from './contacts';

describe('friends from the address book', () => {
  const book = [
    { id: '2', name: 'Otis Brandt', phoneNumbers: [{ number: '+44 7700 900002' }] },
    { id: '1', firstName: 'Mo', lastName: 'Halloran', phoneNumbers: [{ number: '07700 900001' }] },
    { id: '3', name: 'No Number', phoneNumbers: [] },
    { id: '4', name: '', phoneNumbers: [{ number: '123' }] },
    { id: '2', name: 'Otis Brandt', phoneNumbers: [{ number: '+44 7700 900002' }] },
    { id: '5', name: 'Bea Nguyễn', phoneNumbers: [{ number: '' }, { number: '0901 234 567' }] },
  ];

  it('keeps people with a name and a number, once each, by name', () => {
    expect(friendsIn(book, 'en').map((f) => [f.name, f.phone, f.initial])).toEqual([
      ['Bea Nguyễn', '0901 234 567', 'B'],
      ['Mo Halloran', '07700 900001', 'M'],
      ['Otis Brandt', '+44 7700 900002', 'O'],
    ]);
  });

  it('searches without minding case or marks', () => {
    const friends = friendsIn(book, 'en');
    expect(matching(friends, 'nguyen').map((f) => f.id)).toEqual(['5']);
    expect(matching(friends, ' ')).toHaveLength(3);
  });

  it('gives each person the same tint every time', () => {
    expect(tintFor('abc')).toBe(tintFor('abc'));
  });
});
