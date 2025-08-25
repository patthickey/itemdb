import {
  Heading,
  Text,
  Center,
  Box,
  Flex,
  Link,
  GridItem,
  Progress,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel,
  SimpleGrid,
  Select,
  useDisclosure,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  Button,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import Layout from '../../components/Layout';
import { createTranslator, useFormatter, useTranslations } from 'next-intl';
import { ReactElement, useEffect, useMemo, useState } from 'react';
import Image from '../../components/Utils/Image';
import { loadTranslation } from '@utils/load-translation';
import FeedbackButton from '@components/Feedback/FeedbackButton';
import axios from 'axios';
import { ItemData, ObligatoryUserList, UserList, SearchFilters as SearchFiltersType } from '@types';
import NextLink from 'next/link';

import { getUserLists } from '../api/v1/lists/[username]';
import { GetServerSidePropsContext, NextApiRequest } from 'next';
import { getListItems } from '../api/v1/lists/[username]/[list_id]/itemdata';
import ItemCard from '@components/Items/ItemCard';
import NextImage from 'next/image';
import NPBag from '../../public/icons/npbag.png';
import { preloadListItems } from '../api/v1/lists/[username]/[list_id]/items';
import useSWRImmutable from 'swr/immutable';
import { SortSelect } from '@components/Input/SortSelect';
import { BsFilter } from 'react-icons/bs';
import SearchFilterModal from '@components/Search/SearchFiltersModal';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { sortListItems } from '@utils/utils';
import { CheckAuth } from '@utils/googleCloud';

const ALBUM_MAX = 25;
const FILTERS = ['Show All', 'Complete', 'In Progress'];

const cleanPercentage = (num: number, max: number) =>
  Math.max(0, Math.min(100, max ? Math.round((num / max) * 100) : 0));

function sortPrices(array: ItemDataWithHidden[]) {
  return array.sort(function (a, b) {
    const x = a.price.value;
    const y = b.price.value;

    const xIsNum = typeof x === 'number' && !isNaN(x);
    const yIsNum = typeof y === 'number' && !isNaN(y);

    if (xIsNum && yIsNum) {
      return x - y;
    }
    if (xIsNum && !yIsNum) {
      return -1;
    }
    if (!xIsNum && yIsNum) {
      return 1;
    }
    return 0;
  });
}

interface ItemDataWithHidden extends ItemData {
  isHidden: boolean;
}

type Album = {
  list: UserList;
  owned: number;
  released: number;
  price: number;
  stamps: ItemDataWithHidden[];
};

type Props = {
  albums: Album[];
  userListFound: boolean;
  messages: any;
  locale: string;
};

const StampCollector = (props: Props) => {
  const t = useTranslations();
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>(props.albums);
  const [selectedReleased, setSelectedReleased] = useState<string>(FILTERS[0]);
  const [selectedCollection, setSelectedCollection] = useState<string>(FILTERS[0]);
  const [isLoading, setLoading] = useState<boolean>(true);
  const [isFiltered, setIsFiltered] = useState<boolean>(false);

  const collectionStatus = useMemo(() => {
    let total = 0;
    let released = 0;
    let owned = 0;

    props.albums.forEach((album) => {
      released += album.released;
      total += ALBUM_MAX;
      owned += album.owned;
    });

    return {
      total,
      released,
      owned,
    };
  }, [props.albums]);

  const sortTypes = useMemo(() => {
    return {
      name: 'name',
      price: 'price',
      released: 'released',
      collected: 'collected',
      quantity: 'quantity',
    };
  }, []);

  const [sortInfo, setSortInfo] = useState<{
    sortBy: string;
    sortDir: string;
  }>({ sortBy: 'name', sortDir: 'asc' });

  const isReleasedComplete = (stamps: ItemDataWithHidden[]) => stamps.length === 25;
  const isCollectionComplete = (stamps: ItemDataWithHidden[]) =>
    stamps.length > 0 && stamps.every((s) => s.isHidden);

  const norm = (v: string) => v.toLowerCase().trim().replace(/\s+/g, '-'); // "In Progress" -> "in-progress"

  const handleReleasedFilter = (value: string) => {
    setSelectedReleased(value);
  };

  const handleCollectionFilter = (value: string) => {
    setSelectedCollection(value);
  };

  const handleSortChange = (sortBy: string, sortDir: string) => {
    setLoading(true);
    setSortInfo({ sortBy, sortDir });
  };

  useEffect(() => {
    const released = norm(selectedReleased); // 'all' | 'complete' | 'in-progress'
    const collection = norm(selectedCollection); // same

    const next = props.albums.filter((a) => {
      const releasedComplete = isReleasedComplete(a.stamps);
      const collectionComplete = isCollectionComplete(a.stamps);

      const releasedPass =
        released === 'show-all'
          ? true
          : released === 'complete'
            ? releasedComplete
            : !releasedComplete; // "in-progress"

      const collectionPass =
        collection === 'show-all'
          ? true
          : collection === 'complete'
            ? collectionComplete
            : !collectionComplete; // "in-progress"

      return releasedPass && collectionPass;
    });

    const { sortBy, sortDir } = sortInfo;

    if (sortBy === 'name') {
      if (sortDir === 'asc') {
        next.sort((a, b) => a.list.name.localeCompare(b.list.name));
      } else {
        next.sort((a, b) => b.list.name.localeCompare(a.list.name));
      }
    } else if (sortBy === 'price') {
      if (sortDir === 'asc') {
        next.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      } else {
        next.sort((a, b) => (b.price ?? Infinity) - (a.price ?? Infinity));
      }
    } else if (sortBy === 'released') {
      if (sortDir === 'asc') {
        next.sort((a, b) => a.released / ALBUM_MAX - b.released / ALBUM_MAX);
      } else {
        next.sort((a, b) => b.released / ALBUM_MAX - a.released / ALBUM_MAX);
      }
    } else if (sortBy === 'collected') {
      if (sortDir === 'asc') {
        next.sort((a, b) => a.owned / a.released - b.owned / b.released);
      } else {
        next.sort((a, b) => b.owned / b.released - a.owned / a.released);
      }
    } else if (sortBy === 'quantity') {
      if (sortDir === 'asc') {
        next.sort((a, b) => a.released - a.owned - (b.released - b.owned));
      } else {
        next.sort((a, b) => b.released - b.owned - (a.released - a.owned));
      }
    }

    setFilteredAlbums(next);
    setLoading(false);
  }, [props.albums, selectedReleased, selectedCollection, sortInfo]);

  return (
    <>
      <Box
        position="absolute"
        h="650px"
        left="0"
        width="100%"
        bgGradient={`linear-gradient(to top,rgba(0,0,0,0) 0,rgba(66, 202, 255, 0.7) 70%)`}
        zIndex={-1}
      />
      <Center mt={8} flexFlow="column" gap={2} textAlign="center">
        <Image
          src={'https://images.neopets.com/shopkeepers/58.gif'}
          width={200}
          height={200}
          objectPosition={'top'}
          objectFit={'cover'}
          borderRadius={'md'}
          boxShadow={'md'}
          alt="post office man"
        />
        <Heading as="h1" size="lg">
          {t('StampCollector.stamp-collector')}
        </Heading>
        <Text maxW={'700px'} textAlign={'center'} fontSize={'sm'} sx={{ textWrap: 'pretty' }}>
          {t('StampCollector.description')}
        </Text>

        <Flex
          justifyContent={'space-between'}
          alignItems="center"
          gap={3}
          flexFlow={{ base: 'column-reverse', lg: 'row' }}
        >
          <HStack>
            <Text
              flex="0 0 auto"
              textColor={'gray.300'}
              fontSize="sm"
              display={{ base: 'none', md: 'inherit' }}
            >
              Released
            </Text>
            <Menu>
              <MenuButton as={Button} rightIcon={<ChevronDownIcon />} isDisabled={isLoading}>
                {selectedReleased || FILTERS[0]}
              </MenuButton>

              <MenuList>
                {FILTERS.map((stat) => (
                  <MenuItem
                    key={stat}
                    value={stat.toLowerCase()}
                    onClick={(e) => handleReleasedFilter(stat)}
                  >
                    {stat}
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            <Text
              flex="0 0 auto"
              textColor={'gray.300'}
              fontSize="sm"
              display={{ base: 'none', md: 'inherit' }}
            >
              Collection
            </Text>
            <Menu>
              <MenuButton as={Button} rightIcon={<ChevronDownIcon />} isDisabled={isLoading}>
                {selectedCollection || FILTERS[0]}
              </MenuButton>

              <MenuList>
                {FILTERS.map((stat) => (
                  <MenuItem
                    key={stat}
                    value={stat.toLowerCase()}
                    onClick={(e) => handleCollectionFilter(stat)}
                  >
                    {stat}
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            <Text
              flex="0 0 auto"
              textColor={'gray.300'}
              fontSize="sm"
              display={{ base: 'none', md: 'inherit' }}
            >
              {t('General.sort-by')}
            </Text>
            <SortSelect
              sortTypes={sortTypes}
              sortBy={sortInfo.sortBy}
              onClick={handleSortChange}
              sortDir={sortInfo.sortDir as 'asc' | 'desc'}
              disabled={isLoading}
            />
          </HStack>
        </Flex>

        <Center mt={4} w="100%">
          <Box bg="blackAlpha.400" p={3} borderRadius="md" w="100%">
            <Flex direction={'column'} gap={2} justify={'space-between'}>
              <Flex direction={'row'} gap={2} justify={'space-between'}>
                <Text as="span" textColor={'gray.300'} fontSize="sm">
                  RELEASED
                </Text>
                <Text as="span" textColor={'gray.300'} fontSize="sm">
                  {collectionStatus.released} / {collectionStatus.total} &middot;{' '}
                  {cleanPercentage(collectionStatus.released, collectionStatus.total)}%
                </Text>
              </Flex>
              <Progress
                colorScheme="purple"
                size="lg"
                borderRadius={'md'}
                min={0}
                max={collectionStatus.total}
                value={collectionStatus.released}
              />
              <Flex direction={'row'} gap={2} justify={'space-between'}>
                <Text as="span" textColor={'gray.300'} fontSize="sm">
                  COLLECTED
                </Text>
                <Text as="span" textColor={'gray.300'} fontSize="sm">
                  {collectionStatus.owned} / {collectionStatus.released} &middot;{' '}
                  {cleanPercentage(collectionStatus.owned, collectionStatus.released)}%
                </Text>
              </Flex>
              <Progress
                colorScheme="cyan"
                size="lg"
                borderRadius={'md'}
                min={0}
                max={collectionStatus.released}
                value={collectionStatus.owned}
              />
            </Flex>
          </Box>
        </Center>

        <Center mt={4} w="100%">
          <SimpleGrid columns={[1, null, 2, 3]} gap={2} w="100%">
            {filteredAlbums.map((album, i) => (
              <AlbumCard
                key={i}
                list={album.list}
                stamps={album.stamps}
                price={album.price}
                released={album.released}
                owned={album.owned}
              />
            ))}
          </SimpleGrid>
        </Center>
        <FeedbackButton mt={5} />
      </Center>
    </>
  );
};

export default StampCollector;

const AlbumCard = (props: Album) => {
  const t = useTranslations();
  const format = useFormatter();
  const { list, stamps, price, released } = props;
  const owned = stamps.filter((stamp) => stamp.isHidden === true);

  return (
    <GridItem bg="blackAlpha.400" p={3} borderRadius={'md'}>
      <Flex direction={'column'} gap={2} justify={'space-between'}>
        <Link
          as={NextLink}
          href={`/lists/${list.official ? 'official' : list.owner.username}/${
            list.slug ?? list.internal_id
          }`}
          _hover={{ textDecoration: 'none' }}
        >
          <Text as="div" textColor={'gray.300'} fontSize="lg" textAlign="left">
            {list.name.replace('Stamp Album -', '')}
          </Text>
        </Link>
        <Text as="div" textColor={'gray.300'} fontSize="sm" textAlign="left">
          {t('Lists.this-list-costs-aprox')}{' '}
          {!!price && (
            <>
              <b>{format.number(price)} NP</b>
              <Image
                as={NextImage}
                display="inline"
                verticalAlign="bottom"
                src={NPBag}
                width="24px"
                height="24px"
                alt="gift box icon"
                mt="-7px"
                ml="3px"
              />
            </>
          )}
        </Text>
        <Flex direction={'row'} gap={2} justify={'space-between'}>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            RELEASED
          </Text>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            {released} / {ALBUM_MAX} &middot; {cleanPercentage(released, ALBUM_MAX)}%
          </Text>
        </Flex>
        <Progress
          colorScheme="purple"
          size="lg"
          borderRadius={'md'}
          min={0}
          max={ALBUM_MAX}
          value={released}
        />
        <Flex direction={'row'} gap={2} justify={'space-between'}>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            COLLECTED
          </Text>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            {owned.length} / {released} &middot; {cleanPercentage(owned.length, released)}%
          </Text>
        </Flex>
        <Progress
          colorScheme="cyan"
          size="lg"
          borderRadius={'md'}
          min={0}
          max={released}
          value={owned.length}
        />
        {owned.length === released && (
          <Box bg="blackAlpha.400" borderRadius={'md'} height="100%" p={2}>
            <Text as="span" textColor={'green.300'} fontSize="md">
              Collection up to date!
            </Text>
          </Box>
        )}
        {owned.length !== released && <NeededStampsList stamps={props.stamps} owned={owned} />}
      </Flex>
    </GridItem>
  );
};

type NeededStampsList = {
  stamps: ItemDataWithHidden[];
  owned: ItemDataWithHidden[];
};

const NeededStampsList = (props: NeededStampsList) => {
  const { stamps, owned } = props;

  const sorted = sortPrices(stamps);

  return (
    <Accordion allowToggle>
      <AccordionItem border={'none'}>
        <AccordionButton bg="blackAlpha.400" _hover={{ bg: 'whiteAlpha.100' }} borderRadius={'md'}>
          <Box as="span" flex="1" textAlign="left">
            Collectibles Needed ({stamps.length - owned.length})
          </Box>
          <AccordionIcon />
        </AccordionButton>

        <AccordionPanel pb={4}>
          <Flex wrap="wrap" gap={2} justifyContent={'center'}>
            {sorted.map((item, i) => !item.isHidden && <ItemCard item={item} key={i} small />)}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const check = await CheckAuth(context.req as NextApiRequest);
  if (!check.user) throw new Error('User not found');
  if (!check.user.username) throw new Error('Username not found');

  const officialLists = await getUserLists('official', null, 100);
  const albums = [];
  let userListFound = false;

  const allCollectibles = officialLists.find(
    (list) => list.visibility !== 'public' && list.slug === 'all-collectibles'
  );

  if (allCollectibles) {
    let preloadMap = null;
    const userLists = await getUserLists(check.user?.username, null, 100);
    const match = userLists.find((list) => list.linkedListId === allCollectibles.internal_id);
    if (match) {
      userListFound = true;
      const [preloadData] = await Promise.all([preloadListItems(match, true, 999)]);
      preloadMap = new Map(preloadData.items.map((p) => [p.item_iid, p.isHidden]));
    }

    for (const list of officialLists) {
      if (list.visibility === 'public') {
        const list_id = list.internal_id.toString();
        if (!list_id) return null;
        const listItems = await getListItems(list_id, 'official');
        if (listItems) {
          albums.push({
            list,
            owned: preloadMap
              ? listItems.filter((item) => preloadMap.get(item.internal_id)).length
              : 0,
            released: list.itemCount,
            price: listItems.reduce((sum, item) => {
              return sum + (item.price?.value ?? 0);
            }, 0),
            stamps: listItems.map((item) => ({
              ...item,
              isHidden: (preloadMap && preloadMap.get(item.internal_id)) ?? false,
            })),
          });
        }
      }
    }
  }

  context.res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');

  return {
    props: {
      albums: albums,
      userListFound: userListFound,
      messages: await loadTranslation(context.locale as string, 'tools/stamp-collector'),
      locale: context.locale,
    },
  };
}

StampCollector.getLayout = function getLayout(page: ReactElement, props: any) {
  const t = createTranslator({ messages: props.messages, locale: props.locale });

  return (
    <Layout
      SEO={{
        title: t('StampCollector.stamp-collector'),
        description: t('StampCollector.description'),
        themeColor: '#3697bf',
      }}
      mainColor="#3697bfc7"
    >
      {page}
    </Layout>
  );
};
